/**
 * ml-auth.js — Gerenciador de token OAuth do Mercado Livre
 * Busca token via client_credentials, cacheia no localStorage por 6h.
 */

const ML_CLIENT_ID     = "1479387515607586";
const ML_CLIENT_SECRET = "LdtTfXqDOnAzCNwcHnfncDbnKxlejUys";
const ML_TOKEN_URL     = "https://api.mercadolibre.com/oauth/token";
const ML_TOKEN_KEY     = "ml_access_token";
const ML_EXPIRY_KEY    = "ml_token_expiry";

async function getMLToken() {
  // Retorna token cacheado se ainda válido (com 2 min de margem)
  const cached = localStorage.getItem(ML_TOKEN_KEY);
  const expiry  = parseInt(localStorage.getItem(ML_EXPIRY_KEY) || "0");
  if (cached && Date.now() < expiry - 120000) return cached;

  // Busca novo token
  const resp = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: `grant_type=client_credentials&client_id=${ML_CLIENT_ID}&client_secret=${ML_CLIENT_SECRET}`,
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.status);
    throw new Error(`Token ML: HTTP ${resp.status} — ${err}`);
  }

  const data = await resp.json();
  const token     = data.access_token;
  const expiresIn = data.expires_in || 21600; // 6h padrão

  localStorage.setItem(ML_TOKEN_KEY, token);
  localStorage.setItem(ML_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));

  return token;
}

/**
 * Faz fetch autenticado na API do ML.
 * @param {string} url - URL completa da API
 * @returns {Promise<Object>} JSON da resposta
 */
async function mlFetch(url) {
  const token = await getMLToken();
  const resp  = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
