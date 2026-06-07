const axios = require("axios");

const ML_BASE      = "https://api.mercadolibre.com";
const SITE         = "MLB";
const ML_CLIENT_ID = "1479387515607586";
const ML_SECRET    = "LdtTfXqDOnAzCNwcHnfncDbnKxlejUys";

// Cache do token em memória (válido enquanto a instância viver)
let _cachedToken   = null;
let _tokenExpiry   = 0;

/**
 * Retorna um access_token via client_credentials.
 * Cacheia em memória e renova 2 min antes de vencer.
 */
async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 120000) return _cachedToken;

  const { data } = await axios.post(
    `${ML_BASE}/oauth/token`,
    `grant_type=client_credentials&client_id=${ML_CLIENT_ID}&client_secret=${ML_SECRET}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, timeout: 8000 }
  );

  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in || 21600) * 1000;
  return _cachedToken;
}

/**
 * Busca produtos no Mercado Livre pela query.
 */
async function searchProducts(query, limit = 10, category = null) {
  const token  = await getToken();
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
  const token    = await getToken();
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

  const hasSalePrice =
    !!(item.sale_price) ||
    !!(item.promotions && item.promotions.length > 0) ||
    discountPercent > 0;

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
    has_sale_price:   hasSalePrice,
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

module.exports = { searchProducts, getItemById, delay, getToken };
