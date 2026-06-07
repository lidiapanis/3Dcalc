/**
 * Rotas REST para o módulo de monitoramento de preços.
 *
 * Base: /api/monitor  (prefixo configurado no index.js)
 *
 * Produtos monitorados (tracked_products):
 *   GET    /products            - Listar todos
 *   POST   /products            - Cadastrar novo
 *   GET    /products/:id        - Detalhe de um produto
 *   PUT    /products/:id        - Atualizar
 *   DELETE /products/:id        - Remover
 *
 * Histórico de preços:
 *   GET    /history/:mlId       - Histórico de preços de um item ML
 *   GET    /history/product/:id - Todo histórico de um produto monitorado
 *
 * Ofertas:
 *   GET    /deals               - Listar ofertas (paginado, mais recentes primeiro)
 *   GET    /deals/latest        - Última oferta de cada produto
 *   PATCH  /deals/:id/read      - Marcar oferta como lida
 *
 * Job:
 *   POST   /run                 - Disparo manual do job de monitoramento
 */

const express = require("express");
const admin = require("firebase-admin");
const { runPriceMonitor } = require("../jobs/price-monitor.job");
const { searchProducts, exchangeCode } = require("../services/mercadolivre.service");

const router = express.Router();
const db = () => admin.firestore();

// ─── Helpers ────────────────────────────────────────────────────────────────

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

function toJson(doc) {
  return { id: doc.id, ...doc.data() };
}

// ─── Busca prévia na API do ML ───────────────────────────────────────────────

/**
 * GET /api/monitor/search?q=...&limit=10
 * Faz uma busca direta na API do ML para preview antes de cadastrar.
 */
router.get("/search", async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return fail(res, "Parâmetro 'q' é obrigatório.");
  try {
    const items = await searchProducts(q, parseInt(limit) || 5);
    return ok(res, items);
  } catch (err) {
    const mlStatus = err.response ? err.response.status : null;
    const mlBody   = err.response ? JSON.stringify(err.response.data).substring(0, 300) : "";
    console.error("Erro na busca ML:", err.message, "| status:", mlStatus, "| body:", mlBody);
    return fail(res, `Erro ML (${mlStatus || "sem resposta"}): ${err.message} — ${mlBody}`, 502);
  }
});

// ─── Tracked Products ────────────────────────────────────────────────────────

router.get("/products", async (req, res) => {
  try {
    const snap = await db().collection("tracked_products").orderBy("created_at", "desc").get();
    return ok(res, snap.docs.map(toJson));
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

router.post("/products", async (req, res) => {
  const { name, query, limit, category, min_discount_percent, active } = req.body;

  if (!name || !name.trim()) return fail(res, "Campo 'name' é obrigatório.");
  if (!query || !query.trim()) return fail(res, "Campo 'query' é obrigatório.");

  try {
    const docData = {
      name: name.trim(),
      query: query.trim(),
      limit: parseInt(limit) || 10,
      category: category || null,
      min_discount_percent: parseInt(min_discount_percent) || 10,
      active: active !== false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      last_checked_at: null,
      last_items_found: 0,
    };

    const ref = await db().collection("tracked_products").add(docData);
    const doc = await ref.get();
    return ok(res, toJson(doc), 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const doc = await db().collection("tracked_products").doc(req.params.id).get();
    if (!doc.exists) return fail(res, "Produto não encontrado.", 404);
    return ok(res, toJson(doc));
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

router.put("/products/:id", async (req, res) => {
  const allowed = ["name", "query", "limit", "category", "min_discount_percent", "active"];
  const updates = {};
  allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

  if (Object.keys(updates).length === 0) return fail(res, "Nenhum campo válido para atualizar.");

  if (updates.limit) updates.limit = parseInt(updates.limit);
  if (updates.min_discount_percent) updates.min_discount_percent = parseInt(updates.min_discount_percent);

  try {
    const ref = db().collection("tracked_products").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Produto não encontrado.", 404);

    await ref.update({ ...updates, updated_at: admin.firestore.FieldValue.serverTimestamp() });
    const updated = await ref.get();
    return ok(res, toJson(updated));
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const ref = db().collection("tracked_products").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Produto não encontrado.", 404);
    await ref.delete();
    return ok(res, { deleted: req.params.id });
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ─── Histórico de Preços ─────────────────────────────────────────────────────

/**
 * GET /api/monitor/history/:mlId?days=7
 * Histórico de preços de um item ML específico.
 */
router.get("/history/:mlId", async (req, res) => {
  const { mlId } = req.params;
  const days = parseInt(req.query.days) || 7;

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snap = await db()
      .collection("price_history")
      .where("ml_id", "==", mlId)
      .where("fetched_at", ">=", admin.firestore.Timestamp.fromDate(since))
      .orderBy("fetched_at", "asc")
      .get();

    return ok(res, snap.docs.map(toJson));
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

/**
 * GET /api/monitor/history/product/:id?days=7
 * Todo histórico de um produto monitorado.
 */
router.get("/history/product/:id", async (req, res) => {
  const days = parseInt(req.query.days) || 7;

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snap = await db()
      .collection("price_history")
      .where("tracked_product_id", "==", req.params.id)
      .where("fetched_at", ">=", admin.firestore.Timestamp.fromDate(since))
      .orderBy("fetched_at", "asc")
      .get();

    return ok(res, snap.docs.map(toJson));
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ─── Deals ───────────────────────────────────────────────────────────────────

/**
 * GET /api/monitor/deals?limit=20&onlyUnread=false
 */
router.get("/deals", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const onlyUnread = req.query.onlyUnread === "true";

  try {
    let query = db().collection("deals").orderBy("detected_at", "desc");
    if (onlyUnread) query = query.where("is_read", "==", false);
    query = query.limit(limit);

    const snap = await query.get();
    return ok(res, snap.docs.map(toJson));
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

/**
 * GET /api/monitor/deals/latest
 * Última oferta de cada produto monitorado.
 */
router.get("/deals/latest", async (req, res) => {
  try {
    const productsSnap = await db().collection("tracked_products").get();
    const results = [];

    for (const productDoc of productsSnap.docs) {
      const snap = await db()
        .collection("deals")
        .where("tracked_product_id", "==", productDoc.id)
        .orderBy("detected_at", "desc")
        .limit(1)
        .get();

      if (!snap.empty) {
        results.push({
          product: toJson(productDoc),
          latest_deal: toJson(snap.docs[0]),
        });
      }
    }

    return ok(res, results);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

/**
 * PATCH /api/monitor/deals/:id/read
 * Marca uma oferta como lida.
 */
router.patch("/deals/:id/read", async (req, res) => {
  try {
    const ref = db().collection("deals").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return fail(res, "Oferta não encontrada.", 404);

    await ref.update({ is_read: true, read_at: admin.firestore.FieldValue.serverTimestamp() });
    return ok(res, { id: req.params.id, is_read: true });
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ─── OAuth ML ────────────────────────────────────────────────────────────────

/**
 * POST /api/monitor/ml-auth  { code: "..." }
 * Troca o authorization_code pelo access_token + refresh_token.
 * Chamado pela ml-callback.html após o redirect do ML.
 */
router.post("/ml-auth", async (req, res) => {
  const { code } = req.body;
  if (!code) return fail(res, "Parâmetro 'code' é obrigatório.");
  try {
    await exchangeCode(code);
    return ok(res, { message: "Mercado Livre autorizado com sucesso! Pode fechar esta aba." });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Erro ao trocar código ML:", detail);
    return fail(res, "Erro na autorização: " + detail, 500);
  }
});

/**
 * GET /api/monitor/ml-status
 * Verifica se o ML está autorizado.
 */
router.get("/ml-status", async (req, res) => {
  try {
    const admin = require("firebase-admin");
    const doc = await admin.firestore().collection("config").doc("ml_tokens").get();
    if (!doc.exists) return ok(res, { authorized: false });
    const d = doc.data();
    return ok(res, {
      authorized: true,
      ml_user_id: d.ml_user_id,
      expires_at: d.expires_at,
      authorized_at: d.authorized_at,
    });
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ─── Job Manual ──────────────────────────────────────────────────────────────

/**
 * POST /api/monitor/run
 * Dispara o job manualmente (útil para testes).
 */
router.post("/run", async (req, res) => {
  try {
    const result = await runPriceMonitor();
    return ok(res, result);
  } catch (err) {
    console.error("Erro no job manual:", err);
    return fail(res, "Erro ao executar job: " + err.message, 500);
  }
});

module.exports = router;
