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

// ─── Scraping de produto ML por URL ──────────────────────────────────────────

/**
 * GET /api/monitor/scrape?url=https://www.mercadolivre.com.br/...
 * Faz scraping da página do produto e extrai preço/título sem precisar de API key.
 */
router.get("/scrape", async (req, res) => {
  const axios = require("axios");
  const { url } = req.query;
  if (!url) return fail(res, "Parâmetro 'url' é obrigatório.");

  // Aceita também ID direto: MLB1234567
  let targetUrl = url;
  if (/^MLB\d+$/i.test(url.trim())) {
    targetUrl = `https://www.mercadolivre.com.br/p/${url.trim().toUpperCase()}`;
  }

  try {
    const { data: html } = await axios.get(targetUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      maxRedirects: 5,
    });

    let title = null, price = null, originalPrice = null, thumbnail = null, productUrl = targetUrl, mlId = null, sellerName = null;

    // ── 1. JSON-LD (structured data) ─────────────────────────────────────────
    const jsonLdBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const [, inner] of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(inner);
        const nodes  = Array.isArray(parsed) ? parsed : [parsed];
        const prod   = nodes.find(n => n["@type"] === "Product");
        if (prod) {
          title    = prod.name || title;
          thumbnail = (Array.isArray(prod.image) ? prod.image[0] : prod.image) || thumbnail;
          productUrl = prod.url || productUrl;
          const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
          if (offer) {
            price         = parseFloat(offer.price) || price;
            originalPrice = parseFloat(offer.highPrice) || null;
          }
          break;
        }
      } catch (_) {}
    }

    // ── 2. window.__PRELOADED_STATE__ ────────────────────────────────────────
    if (!price) {
      const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          // Navega a estrutura para achar o preço
          const findPrice = (obj, depth = 0) => {
            if (depth > 8 || !obj || typeof obj !== "object") return null;
            if (typeof obj.price === "number") return obj.price;
            if (typeof obj.sale_price === "number") return obj.sale_price;
            for (const v of Object.values(obj)) {
              const found = findPrice(v, depth + 1);
              if (found) return found;
            }
            return null;
          };
          price = findPrice(state) || price;
        } catch (_) {}
      }
    }

    // ── 3. Meta tags OG ──────────────────────────────────────────────────────
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/)?.[1]
                 || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/)?.[1];
    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/)?.[1]
                 || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/)?.[1];
    const ogUrl   = html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/)?.[1]
                 || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:url"/)?.[1];

    if (!title && ogTitle) title = ogTitle.replace(/\s*[\|\-]\s*Mercado Livre.*$/i, "").trim();
    if (!thumbnail && ogImage) thumbnail = ogImage;
    if (ogUrl) productUrl = ogUrl;

    // ── 4. ID do produto ─────────────────────────────────────────────────────
    const idFromUrl = (ogUrl || targetUrl).match(/MLB[\d]+/i);
    mlId = idFromUrl ? idFromUrl[0].toUpperCase() : null;

    // ── 5. Preço via padrões no HTML ─────────────────────────────────────────
    if (!price) {
      // Padrão "fraction" + "cents" do andes-money-amount
      const fracMatch = html.match(/"andes-money-amount__fraction"[^>]*>\s*(\d[\d.]*)\s*</);
      const centMatch = html.match(/"andes-money-amount__cents"[^>]*>\s*(\d+)\s*</);
      if (fracMatch) {
        const frac = fracMatch[1].replace(/\./g, "");
        const cent = centMatch ? centMatch[1] : "00";
        price = parseFloat(`${frac}.${cent}`);
      }
    }
    if (!price) {
      // JSON inline: "price":199.90
      const m = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
      if (m) price = parseFloat(m[1]);
    }
    if (!price) {
      // Meta description com R$
      const m = html.match(/R\$\s*(\d[\d.,]+)/);
      if (m) price = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    }

    // ── 6. Vendedor ───────────────────────────────────────────────────────────
    const sellerMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    if (sellerMatch) sellerName = sellerMatch[1];

    // ── Validação final ───────────────────────────────────────────────────────
    if (!title && !price) {
      return fail(res, "Não foi possível extrair dados. O ML pode estar bloqueando ou a URL é inválida.", 422);
    }

    const discountPercent = (originalPrice && originalPrice > price)
      ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

    return ok(res, [{
      ml_id:            mlId || "UNKNOWN",
      title:            title || "Produto ML",
      url:              productUrl,
      thumbnail:        thumbnail ? thumbnail.replace("http://", "https://") : null,
      seller_name:      sellerName,
      current_price:    price || 0,
      original_price:   originalPrice || null,
      discount_percent: discountPercent,
      has_sale_price:   discountPercent > 0,
      free_shipping:    /frete gr[aá]tis/i.test(html),
      condition:        /"condition"\s*:\s*"new"/.test(html) ? "new" : "unknown",
      fetched_at:       new Date().toISOString(),
    }]);
  } catch (err) {
    const status = err.response?.status;
    console.error("Scrape erro:", err.message, "status:", status);
    if (status === 404) return fail(res, "Produto não encontrado. Verifique a URL.", 404);
    return fail(res, "Erro ao acessar a página: " + err.message, 502);
  }
});

// ─── Categorias ML ───────────────────────────────────────────────────────────

const ML_CATEGORIES = [
  { id: "MLB5672",  name: "Games e Consoles",          icon: "fa-gamepad" },
  { id: "MLB1648",  name: "Computadores e Acessórios", icon: "fa-laptop" },
  { id: "MLB1051",  name: "Celulares e Smartphones",   icon: "fa-mobile-alt" },
  { id: "MLB1000",  name: "Eletrônicos",               icon: "fa-tv" },
  { id: "MLB1459",  name: "Eletrodomésticos",          icon: "fa-blender" },
  { id: "MLB1574",  name: "Ferramentas e Construção",  icon: "fa-tools" },
  { id: "MLB1368",  name: "Esportes e Fitness",        icon: "fa-running" },
  { id: "MLB1132",  name: "Casa e Decoração",          icon: "fa-home" },
  { id: "MLB1182",  name: "Câmeras e Fotografia",      icon: "fa-camera" },
  { id: "MLB1246",  name: "Videogames",                icon: "fa-dice" },
  { id: "MLB1144",  name: "Moda e Acessórios",         icon: "fa-tshirt" },
  { id: "MLB3937",  name: "Brinquedos e Hobbies",      icon: "fa-puzzle-piece" },
  { id: "MLB1953",  name: "Automóveis",                icon: "fa-car" },
  { id: "MLB1499",  name: "Beleza e Cuidado",          icon: "fa-spa" },
];

/**
 * GET /api/monitor/categories
 * Lista todas as categorias disponíveis para monitorar.
 */
router.get("/categories", (req, res) => {
  return ok(res, ML_CATEGORIES);
});

/**
 * GET /api/monitor/highlights/:categoryId
 * Retorna os itens em destaque de uma categoria com detalhes.
 */
router.get("/highlights/:categoryId", async (req, res) => {
  const axios = require("axios");
  const { categoryId } = req.params;
  const ML_BASE = "https://api.mercadolibre.com";

  try {
    // 1. Busca highlights da categoria (funciona sem app aprovado)
    const { data: hlData } = await axios.get(
      `${ML_BASE}/highlights/MLB/category/${categoryId}`,
      { timeout: 10000 }
    );

    const ids = (hlData.content || hlData || [])
      .slice(0, 12)
      .map(i => (typeof i === "string" ? i : i.id))
      .filter(Boolean);

    if (!ids.length) return ok(res, []);

    // 2. Tenta buscar detalhes em batch (pode retornar 403 se app não aprovado)
    let items = [];
    try {
      const { data: batchData } = await axios.get(
        `${ML_BASE}/items`,
        { params: { ids: ids.join(","), attributes: "id,title,price,original_price,thumbnail,permalink,condition,shipping" }, timeout: 10000 }
      );
      items = (Array.isArray(batchData) ? batchData : [])
        .filter(r => r.code === 200)
        .map(r => r.body)
        .map(item => ({
          ml_id:            item.id,
          title:            item.title,
          url:              item.permalink,
          thumbnail:        item.thumbnail ? item.thumbnail.replace("http://", "https://") : null,
          current_price:    item.price || 0,
          original_price:   item.original_price || null,
          discount_percent: item.original_price && item.original_price > item.price
            ? Math.round(((item.original_price - item.price) / item.original_price) * 100) : 0,
          free_shipping:    !!(item.shipping && item.shipping.free_shipping),
          condition:        item.condition || "unknown",
        }));
    } catch (_) {
      // App não aprovado: retorna só os IDs com placeholder
      items = ids.map(id => ({
        ml_id: id, title: null, url: `https://www.mercadolivre.com.br/p/${id}`,
        thumbnail: null, current_price: null, original_price: null,
        discount_percent: 0, free_shipping: false, condition: "unknown",
      }));
    }

    return ok(res, items);
  } catch (err) {
    return fail(res, "Erro ao buscar highlights: " + err.message, 502);
  }
});

// ─── Debug: ver HTML bruto retornado pelo ML ─────────────────────────────────
router.get("/scrape-debug", async (req, res) => {
  const axios = require("axios");
  const { url } = req.query;
  if (!url) return fail(res, "url obrigatório");
  try {
    const { data: html, status, headers } = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      maxRedirects: 5,
    });
    return res.json({
      http_status: status,
      content_type: headers["content-type"],
      html_length: html.length,
      has_preloaded_state: html.includes("__PRELOADED_STATE__"),
      has_json_ld: html.includes("application/ld+json"),
      has_og_title: html.includes("og:title"),
      has_price_fraction: html.includes("andes-money-amount__fraction"),
      title_tag: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || null,
      first_500: html.substring(0, 500),
      last_500: html.substring(html.length - 500),
    });
  } catch (err) {
    return res.json({ error: err.message, status: err.response?.status, response_preview: err.response?.data?.toString().substring(0, 500) });
  }
});

// ─── Busca prévia na API do ML ───────────────────────────────────────────────

/**
 * GET /api/monitor/search?q=...&limit=10
 * Mantido por compatibilidade — usa API do ML (requer app ativo no portal ML).
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
  const { code, code_verifier } = req.body;
  if (!code) return fail(res, "Parâmetro 'code' é obrigatório.");
  try {
    await exchangeCode(code, code_verifier || null);
    return ok(res, { message: "Mercado Livre autorizado com sucesso! Pode fechar esta aba." });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("Erro ao trocar código ML:", detail);
    return fail(res, "Erro na autorização: " + detail, 500);
  }
});

/**
 * GET /api/monitor/ml-test
 * Testa o token ML com endpoints progressivos para diagnosticar o problema.
 */
router.get("/ml-test", async (req, res) => {
  const axios = require("axios");
  const admin = require("firebase-admin");
  const ML_BASE = "https://api.mercadolibre.com";
  const result = {};

  try {
    // 1. Buscar token do Firestore
    const doc = await admin.firestore().collection("config").doc("ml_tokens").get();
    result.token_exists = doc.exists;
    if (!doc.exists) return ok(res, result);

    const d = doc.data();
    result.token_preview = d.access_token ? d.access_token.substring(0, 20) + "..." : null;
    result.expires_at    = d.expires_at ? new Date(d.expires_at).toISOString() : null;
    result.refresh_token = d.refresh_token ? "present" : "null";
    result.is_expired    = d.expires_at ? Date.now() > d.expires_at : null;

    const headers = { "Authorization": `Bearer ${d.access_token}` };

    // 2. Testar /users/me
    try {
      const r = await axios.get(`${ML_BASE}/users/me`, { headers, timeout: 8000 });
      result.users_me = { status: r.status, nickname: r.data.nickname, id: r.data.id };
    } catch (e) {
      result.users_me = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    const APP_ID = "1479387515607586";

    // 3. Testar busca sem auth, sem app_id
    try {
      const r = await axios.get(`${ML_BASE}/sites/MLB/search?q=teste&limit=1`, { timeout: 8000 });
      result.search_no_auth = { status: r.status, total: r.data.paging?.total };
    } catch (e) {
      result.search_no_auth = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    // 4. Testar busca com auth + app_id
    try {
      const r = await axios.get(`${ML_BASE}/sites/MLB/search`, {
        params: { q: "teste", limit: 1, app_id: APP_ID },
        headers,
        timeout: 8000,
      });
      result.search_with_app_id = { status: r.status, total: r.data.paging?.total };
    } catch (e) {
      result.search_with_app_id = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    // 5. Testar busca só com app_id (sem Bearer)
    try {
      const r = await axios.get(`${ML_BASE}/sites/MLB/search`, {
        params: { q: "teste", limit: 1, app_id: APP_ID },
        timeout: 8000,
      });
      result.search_app_id_only = { status: r.status, total: r.data.paging?.total };
    } catch (e) {
      result.search_app_id_only = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    // 6. Testar endpoint /items/search (alternativo)
    try {
      const r = await axios.get(`${ML_BASE}/items/search`, {
        params: { q: "teste", limit: 1, site_id: "MLB" },
        headers,
        timeout: 8000,
      });
      result.items_search = { status: r.status, total: r.data.paging?.total };
    } catch (e) {
      result.items_search = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    // 7. Testar highlights
    try {
      const r = await axios.get(`${ML_BASE}/highlights/MLB/category/MLB5672`, { headers, timeout: 8000 });
      result.highlights = { status: r.status, count: Array.isArray(r.data) ? r.data.length : r.data?.content?.length };
    } catch (e) {
      result.highlights = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    // 8. Testar /items/{id} com token
    try {
      const r = await axios.get(`${ML_BASE}/items/MLB5921008598`, { headers, timeout: 8000 });
      result.items_by_id = { status: r.status, title: r.data.title, price: r.data.price };
    } catch (e) {
      result.items_by_id = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    // 9. Testar /items/{id} sem token
    try {
      const r = await axios.get(`${ML_BASE}/items/MLB5921008598`, { timeout: 8000 });
      result.items_no_auth = { status: r.status, title: r.data.title, price: r.data.price };
    } catch (e) {
      result.items_no_auth = { status: e.response?.status, error: e.response?.data?.message || e.message };
    }

    return ok(res, result);
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

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
