const axios = require("axios");

const ML_BASE = "https://api.mercadolivre.com";
const SITE = "MLB";

/**
 * Busca produtos no Mercado Livre pela query.
 * @param {string} query       - Termo de busca
 * @param {number} limit       - Quantidade máx de resultados (max 50)
 * @param {string} [category]  - ID de categoria ML (ex: "MLB1000")
 * @returns {Promise<Array>}   - Array de itens normalizados
 */
async function searchProducts(query, limit = 10, category = null) {
  const params = { q: query, limit: Math.min(limit, 50) };
  if (category) params.category = category;

  const url = `${ML_BASE}/sites/${SITE}/search`;
  const { data } = await axios.get(url, { params, timeout: 10000 });

  return (data.results || []).map(normalizeItem);
}

/**
 * Busca um item específico pelo ID do ML.
 * @param {string} itemId  - ex: "MLB1234567"
 * @returns {Promise<Object>}
 */
async function getItemById(itemId) {
  const { data } = await axios.get(`${ML_BASE}/items/${itemId}`, { timeout: 10000 });
  return normalizeItem(data);
}

/**
 * Normaliza um item bruto da API do ML para o formato interno.
 */
function normalizeItem(item) {
  const originalPrice = item.original_price || null;
  const currentPrice = item.price || 0;

  let discountPercent = 0;
  if (originalPrice && originalPrice > currentPrice) {
    discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  // Alguns items trazem sale_price no atributo de instalments ou em promotion
  const hasSalePrice =
    !!(item.sale_price) ||
    !!(item.promotions && item.promotions.length > 0) ||
    discountPercent > 0;

  return {
    ml_id: item.id,
    title: item.title,
    url: item.permalink,
    thumbnail: item.thumbnail,
    seller_id: item.seller ? item.seller.id : null,
    seller_name: item.seller ? (item.seller.nickname || null) : null,
    current_price: currentPrice,
    original_price: originalPrice,
    discount_percent: discountPercent,
    has_sale_price: hasSalePrice,
    available_quantity: item.available_quantity || 0,
    sold_quantity: item.sold_quantity || 0,
    condition: item.condition || "unknown",
    free_shipping: !!(item.shipping && item.shipping.free_shipping),
    category_id: item.category_id || null,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Atraso para respeitar rate limit da API do ML.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchProducts, getItemById, delay };
