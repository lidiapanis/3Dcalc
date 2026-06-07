const axios = require("axios");

const ML_BASE = "https://api.mercadolibre.com";
const SITE    = "MLB";

// Headers que simulam um browser — necessário para o ML aceitar requisições server-side
const ML_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Referer": "https://www.mercadolivre.com.br/",
  "Origin": "https://www.mercadolivre.com.br",
};

/**
 * Busca produtos no Mercado Livre pela query.
 * A API pública de busca não requer autenticação — só headers corretos.
 */
async function searchProducts(query, limit = 10, category = null) {
  const params = { q: query, limit: Math.min(limit, 50) };
  if (category) params.category = category;

  const { data } = await axios.get(`${ML_BASE}/sites/${SITE}/search`, {
    params,
    headers: ML_HEADERS,
    timeout: 10000,
  });

  return (data.results || []).map(normalizeItem);
}

/**
 * Busca um item específico pelo ID do ML.
 */
async function getItemById(itemId) {
  const { data } = await axios.get(`${ML_BASE}/items/${itemId}`, {
    headers: ML_HEADERS,
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
