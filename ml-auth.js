/**
 * ml-auth.js
 * Utilitário de busca ML — chama a Cloud Function que autentica e faz o proxy.
 * Endpoint: /api/monitor/search?q=...&limit=...
 */

const ML_API_BASE = "/api/monitor";

/**
 * Faz uma busca de produtos via Cloud Function (que autentica com o ML).
 * @param {string} url - URL completa do endpoint /api/monitor/search?q=...
 * @returns {Promise<Array>} Array de itens normalizados
 */
async function mlFetch(url) {
  // Converte a URL completa do ML para a rota da Cloud Function
  // Ex: https://api.mercadolibre.com/sites/MLB/search?q=x → /api/monitor/search?q=x
  const searchParams = url.split("?")[1] || "";
  const resp = await fetch(`${ML_API_BASE}/search?${searchParams}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  if (!json.success) throw new Error(json.error || "Erro na busca");
  return { results: json.data };
}
