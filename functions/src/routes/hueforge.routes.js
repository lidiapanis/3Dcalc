/**
 * Rotas REST do módulo HueForges.
 *
 * Base: /api/hueforge (prefixo configurado no index.js)
 *
 *   GET /scrape?url=https://makerworld.com/...
 *     Busca a página no servidor (evita CORS) e devolve título/descrição em
 *     texto puro, para o cliente detectar as cores citadas (dicionário em hueforge.js).
 */

const express = require("express");

const router = express.Router();

function ok(res, data) {
  return res.status(200).json({ success: true, data });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

router.get("/scrape", async (req, res) => {
  const axios = require("axios");
  const { url } = req.query;
  if (!url) return fail(res, "Parâmetro 'url' é obrigatório.");

  try {
    const { data: html } = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      maxRedirects: 5,
    });

    const pegaMeta = (re) => {
      const m = html.match(re);
      return m ? m[1] : null;
    };

    const titulo = pegaMeta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
      || pegaMeta(/<title[^>]*>([^<]*)<\/title>/i);
    const descricao = pegaMeta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)
      || pegaMeta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);

    const texto = [titulo, descricao].filter(Boolean).join(" — ");
    return ok(res, { titulo, descricao, texto });
  } catch (err) {
    return fail(res, "Falha ao buscar a página: " + err.message, 502);
  }
});

module.exports = router;
