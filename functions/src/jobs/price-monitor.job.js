/**
 * Job de monitoramento de preços — executado pelo Scheduled Function.
 *
 * Para cada produto monitorado (tracked_products):
 *   1. Busca itens no ML
 *   2. Salva snapshot em price_history
 *   3. Detecta ofertas e salva em deals
 *   4. Atualiza last_checked_at no tracked_product
 *
 * Aguarda 200ms entre buscas para respeitar rate limit da API.
 */

const admin = require("firebase-admin");
const { searchProducts, delay } = require("../services/mercadolivre.service");
const { detectDeal, priceVariation } = require("../services/deal-detector.service");

const db = () => admin.firestore();

/**
 * Ponto de entrada chamado pelo Scheduled Function (e pelo endpoint de trigger manual).
 */
async function runPriceMonitor() {
  const firestore = db();
  const now = admin.firestore.Timestamp.now();
  const log = [];

  // 1. Buscar todos os produtos ativos para monitorar
  const snapshot = await firestore
    .collection("tracked_products")
    .where("active", "==", true)
    .get();

  if (snapshot.empty) {
    return { message: "Nenhum produto ativo para monitorar.", log };
  }

  const products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  log.push(`Monitorando ${products.length} produto(s)...`);

  // 2. Para cada produto, buscar no ML e processar
  for (const product of products) {
    try {
      await processProduct(firestore, product, now, log);
    } catch (err) {
      log.push(`[ERRO] Produto "${product.name}" (${product.id}): ${err.message}`);
      console.error(`Erro ao processar produto ${product.id}:`, err);
    }

    // Rate limiting: 200ms entre requests à API do ML
    await delay(200);
  }

  log.push("Job finalizado.");
  console.log(log.join("\n"));
  return { message: "Job executado com sucesso.", log };
}

/**
 * Processa um único produto monitorado.
 */
async function processProduct(firestore, product, now, log) {
  const { id: productId, name, query, limit = 10, category = null } = product;

  // Buscar itens no ML
  const items = await searchProducts(query, limit, category);
  log.push(`  [${name}] ${items.length} item(s) encontrado(s)`);

  // Buscar histórico recente (7 dias) para detecção de mínimo
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoTs = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

  // Agrupa preços recentes por ml_id para comparação
  const recentPricesSnap = await firestore
    .collection("price_history")
    .where("tracked_product_id", "==", productId)
    .where("fetched_at", ">=", sevenDaysAgoTs)
    .orderBy("fetched_at", "asc")
    .get();

  // Mapeia: ml_id → array de preços recentes
  const pricesByMlId = {};
  recentPricesSnap.forEach((doc) => {
    const d = doc.data();
    if (!pricesByMlId[d.ml_id]) pricesByMlId[d.ml_id] = [];
    pricesByMlId[d.ml_id].push(d.price);
  });

  // Batch write para performance
  const batch = firestore.batch();
  let dealsFound = 0;

  for (const item of items) {
    // Salvar snapshot no price_history
    const histRef = firestore.collection("price_history").doc();
    batch.set(histRef, {
      tracked_product_id: productId,
      tracked_product_name: name,
      ml_id: item.ml_id,
      title: item.title,
      price: item.current_price,
      original_price: item.original_price,
      discount_percent: item.discount_percent,
      has_sale_price: item.has_sale_price,
      seller_id: item.seller_id,
      seller_name: item.seller_name,
      free_shipping: item.free_shipping,
      condition: item.condition,
      url: item.url,
      thumbnail: item.thumbnail,
      fetched_at: now,
    });

    // Detectar se é oferta
    const recentPrices = pricesByMlId[item.ml_id] || [];
    const { isDeal, reasons } = detectDeal(item, product, recentPrices);

    if (isDeal) {
      dealsFound++;
      const lastPrice = recentPrices.length > 0 ? recentPrices[recentPrices.length - 1] : null;
      const variation = priceVariation(item.current_price, lastPrice);

      const dealRef = firestore.collection("deals").doc();
      batch.set(dealRef, {
        tracked_product_id: productId,
        tracked_product_name: name,
        ml_id: item.ml_id,
        title: item.title,
        current_price: item.current_price,
        original_price: item.original_price,
        discount_percent: item.discount_percent,
        price_variation_percent: variation,
        seller_id: item.seller_id,
        seller_name: item.seller_name,
        free_shipping: item.free_shipping,
        url: item.url,
        thumbnail: item.thumbnail,
        reasons,
        detected_at: now,
        is_read: false,
      });

      log.push(`    ⚡ Oferta: "${item.title}" por R$ ${item.current_price.toFixed(2)} — ${reasons.join(" | ")}`);
    }
  }

  // Commit do batch
  await batch.commit();

  // Atualizar last_checked_at e items_found no produto monitorado
  await firestore.collection("tracked_products").doc(productId).update({
    last_checked_at: now,
    last_items_found: items.length,
  });

  log.push(`  [${name}] ${dealsFound} oferta(s) detectada(s)`);
}

module.exports = { runPriceMonitor };
