const axios = require("axios");
const admin = require("firebase-admin");

const ML_BASE      = "https://api.mercadolibre.com";
const SITE         = "MLB";
const ML_CLIENT_ID = "1479387515607586";
const ML_SECRET    = "LdtTfXqDOnAzCNwcHnfncDbnKxlejUys";
const REDIRECT_URI = "https://calculo3d.web.app/ml-callback.html";

// ─── OAuth Token ─────────────────────────────────────────────────────────────

/**
 * Retorna um access_token válido.
 * Lê do Firestore, renova com refresh_token se expirado.
 */
async function getMLAccessToken() {
  const db  = admin.firestore();
  const doc = await db.collection("config").doc("ml_tokens").get();

  if (!doc.exists) {
    throw new Error("ML não autorizado. Acesse Monitoramento de Preços e clique em 'Autorizar Mercado Livre'.");
  }

  const { access_token, refresh_token, expires_at } = doc.data();

  // Renovar se vai expirar em menos de 5 minutos
  if (Date.now() > expires_at - 300000) {
    return await refreshToken(refresh_token);
  }

  return access_token;
}

/**
 * Troca um refresh_token por novo access_token e salva no Firestore.
 */
async function refreshToken(refresh_token) {
  const { data } = await axios.post(
    `${ML_BASE}/oauth/token`,
    `grant_type=refresh_token&client_id=${ML_CLIENT_ID}&client_secret=${ML_SECRET}&refresh_token=${refresh_token}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
  );

  const tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + (data.expires_in || 21600) * 1000,
    updated_at:    admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin.firestore().collection("config").doc("ml_tokens").update(tokens);
  console.log("Token ML renovado com sucesso.");
  return data.access_token;
}

/**
 * Troca um authorization_code por access_token + refresh_token (primeiro login).
 */
async function exchangeCode(code) {
  const { data } = await axios.post(
    `${ML_BASE}/oauth/token`,
    `grant_type=authorization_code&client_id=${ML_CLIENT_ID}&client_secret=${ML_SECRET}&code=${code}&redirect_uri=${REDIRECT_URI}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
  );

  const tokens = {
    access_token:    data.access_token,
    refresh_token:   data.refresh_token,
    expires_at:      Date.now() + (data.expires_in || 21600) * 1000,
    ml_user_id:      data.user_id,
    authorized_at:   admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin.firestore().collection("config").doc("ml_tokens").set(tokens);
  console.log("ML autorizado com sucesso. User ID:", data.user_id);
  return tokens;
}

// ─── API do ML ───────────────────────────────────────────────────────────────

/**
 * Busca produtos no Mercado Livre pela query.
 */
async function searchProducts(query, limit = 10, category = null) {
  const token  = await getMLAccessToken();
  const params = { q: query, limit: Math.min(limit, 50) };
  if (category) params.category = category;

  const { data } = await axios.get(`${ML_BASE}/sites/${SITE}/search`, {
    params,
    headers: { "Authorization": `Bearer ${token}` },
    timeout: 10000,
  });

  return (data.results || []).map(normalizeItem);
}

/**
 * Busca um item específico pelo ID do ML.
 */
async function getItemById(itemId) {
  const token    = await getMLAccessToken();
  const { data } = await axios.get(`${ML_BASE}/items/${itemId}`, {
    headers: { "Authorization": `Bearer ${token}` },
    timeout: 10000,
  });
  return normalizeItem(data);
}

/**
 * Normaliza um item bruto da API do ML para o formato interno.
 */
function normalizeItem(item) {
  const originalPrice = item.original_price || null;
  const currentPrice  = item.price || 0;

  let discountPercent = 0;
  if (originalPrice && originalPrice > currentPrice) {
    discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  return {
    ml_id:            item.id,
    title:            item.title,
    url:              item.permalink,
    thumbnail:        item.thumbnail,
    seller_id:        item.seller ? item.seller.id : null,
    seller_name:      item.seller ? (item.seller.nickname || null) : null,
    current_price:    currentPrice,
    original_price:   originalPrice,
    discount_percent: discountPercent,
    has_sale_price:   !!(item.sale_price) || !!(item.promotions && item.promotions.length) || discountPercent > 0,
    available_quantity: item.available_quantity || 0,
    sold_quantity:    item.sold_quantity || 0,
    condition:        item.condition || "unknown",
    free_shipping:    !!(item.shipping && item.shipping.free_shipping),
    category_id:      item.category_id || null,
    fetched_at:       new Date().toISOString(),
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchProducts, getItemById, delay, exchangeCode, getMLAccessToken };
