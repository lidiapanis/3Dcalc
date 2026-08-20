const axios = require("axios");
const admin = require("firebase-admin");

const ME_BASE       = "https://melhorenvio.com.br/api/v2";
const ME_OAUTH      = "https://melhorenvio.com.br/oauth/token";
const ME_CLIENT_ID  = "25835";
const ME_SECRET     = "xNx8a75jq5qsNY8zlDRssKZG2zNNGARD84b2Gp7I";
const ME_REDIRECT   = "https://calculo3d.web.app/me-callback.html";
const ME_USER_AGENT = "Kombinei/1.0 (kombinei@kombinei.com.br)";
const CEP_ORIGEM    = "18605360";   // CEP de origem configurado

// ─── Token Helpers ────────────────────────────────────────────────────────────

async function getMEAccessToken() {
  const db  = admin.firestore();
  const doc = await db.collection("config").doc("me_tokens").get();

  if (!doc.exists) {
    throw new Error(
      "Melhor Envio não autorizado. Vá em Configurações e clique em 'Autorizar Melhor Envio'."
    );
  }

  const { access_token, refresh_token, expires_at } = doc.data();

  // Renova se expirar em menos de 5 minutos
  if (Date.now() > expires_at - 300_000) {
    return await refreshMEToken(refresh_token);
  }

  return access_token;
}

async function refreshMEToken(refresh_token) {
  const { data } = await axios.post(
    ME_OAUTH,
    {
      grant_type:    "refresh_token",
      client_id:     parseInt(ME_CLIENT_ID, 10),
      client_secret: ME_SECRET,
      refresh_token,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   ME_USER_AGENT,
      },
      timeout: 10_000,
    }
  );

  const tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at:    Date.now() + (data.expires_in || 2_592_000) * 1000,
    updated_at:    admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin.firestore().collection("config").doc("me_tokens").update(tokens);
  console.log("Token Melhor Envio renovado.");
  return data.access_token;
}

// ─── OAuth Exchange ───────────────────────────────────────────────────────────

async function exchangeMECode(code) {
  const { data } = await axios.post(
    ME_OAUTH,
    {
      grant_type:    "authorization_code",
      client_id:     parseInt(ME_CLIENT_ID, 10),
      client_secret: ME_SECRET,
      redirect_uri:  ME_REDIRECT,
      code,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   ME_USER_AGENT,
      },
      timeout: 10_000,
    }
  );

  const tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at:    Date.now() + (data.expires_in || 2_592_000) * 1000,
    authorized_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin.firestore().collection("config").doc("me_tokens").set(tokens);
  console.log("Melhor Envio autorizado com sucesso.");
  return tokens;
}

// ─── Cálculo de Frete ─────────────────────────────────────────────────────────

/**
 * Calcula opções de frete via API do Melhor Envio.
 *
 * @param {object} params
 * @param {string} params.cepDestino  – CEP do destinatário (somente dígitos)
 * @param {number} params.pesoKg      – Peso total do pacote em kg
 * @param {number} [params.altura=10] – Altura do pacote em cm
 * @param {number} [params.largura=15]– Largura do pacote em cm
 * @param {number} [params.comprimento=20] – Comprimento do pacote em cm
 * @param {number} [params.valorSeguro=0]  – Valor declarado para seguro
 * @returns {Promise<Array>}          – Lista de opções ordenada por preço
 */
async function calculateShipping({
  cepDestino,
  pesoKg,
  altura       = 10,
  largura      = 15,
  comprimento  = 20,
  valorSeguro  = 0,
}) {
  const token = await getMEAccessToken();

  const params = {
    "from[postal_code]":        CEP_ORIGEM,
    "to[postal_code]":          cepDestino.replace(/\D/g, ""),
    "package[height]":          altura,
    "package[width]":           largura,
    "package[length]":          comprimento,
    "package[weight]":          Math.max(0.1, parseFloat(pesoKg.toFixed(3))),
    "options[insurance_value]": valorSeguro || 0,
    "options[receipt]":         false,
    "options[own_hand]":        false,
  };

  const { data } = await axios.get(`${ME_BASE}/me/shipment/calculate`, {
    params,
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent":    ME_USER_AGENT,
      "Accept":        "application/json",
    },
    timeout: 15_000,
  });

  return (Array.isArray(data) ? data : [])
    .filter(s => !s.error && s.price)
    .map(s => ({
      id:         s.id,
      nome:       s.name,
      empresa:    s.company?.name || String(s.company || ""),
      preco:      parseFloat(s.price),
      prazo_dias: s.delivery_time || null,
    }))
    .sort((a, b) => a.preco - b.preco);
}

module.exports = { exchangeMECode, getMEAccessToken, calculateShipping, CEP_ORIGEM };
