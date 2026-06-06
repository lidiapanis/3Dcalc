/**
 * Detecta se um item do ML é uma oferta com base nas regras configuradas
 * no produto monitorado e no histórico de preços dos últimos 7 dias.
 *
 * Regras (qualquer uma dispara a oferta):
 *  1. desconto >= min_discount_percent
 *  2. preço atual < mínimo dos últimos 7 dias (novo mínimo histórico)
 *  3. item tem sale_price / promoção ativa
 */

/**
 * @param {Object} item            - Item normalizado do ML (mercadolivre.service)
 * @param {Object} trackedProduct  - Documento do Firestore (tracked_products)
 * @param {number[]} recentPrices  - Preços dos últimos 7 dias para este ml_id
 * @returns {{ isDeal: boolean, reasons: string[] }}
 */
function detectDeal(item, trackedProduct, recentPrices = []) {
  const reasons = [];
  const minDiscount = trackedProduct.min_discount_percent || 10;

  // Regra 1: desconto mínimo configurado
  if (item.discount_percent >= minDiscount) {
    reasons.push(
      `Desconto de ${item.discount_percent}% (mínimo: ${minDiscount}%)`
    );
  }

  // Regra 2: novo mínimo histórico (últimos 7 dias)
  if (recentPrices.length > 0) {
    const minPrice7d = Math.min(...recentPrices);
    if (item.current_price < minPrice7d) {
      reasons.push(
        `Novo mínimo: R$ ${item.current_price.toFixed(2)} (mín. 7d: R$ ${minPrice7d.toFixed(2)})`
      );
    }
  }

  // Regra 3: promoção / sale_price ativo
  if (item.has_sale_price) {
    reasons.push("Promoção / sale_price ativo no ML");
  }

  return { isDeal: reasons.length > 0, reasons };
}

/**
 * Calcula o preço médio de uma lista de valores.
 */
function averagePrice(prices) {
  if (!prices || prices.length === 0) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

/**
 * Calcula a variação percentual do preço atual em relação ao preço anterior.
 * Positivo = aumento, negativo = queda.
 */
function priceVariation(currentPrice, previousPrice) {
  if (!previousPrice || previousPrice === 0) return null;
  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

module.exports = { detectDeal, averagePrice, priceVariation };
