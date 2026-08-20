const express = require("express");
const router  = express.Router();
const admin   = require("firebase-admin");
const { exchangeMECode, calculateShipping } = require("../services/melhorenvio.service");

const ok   = (res, data)               => res.json({ success: true, data });
const fail = (res, msg, status = 400)  => res.status(status).json({ success: false, error: msg });

// ─── GET /frete/status ────────────────────────────────────────────────────────
// Verifica se o Melhor Envio está autorizado
router.get("/status", async (req, res) => {
  try {
    const doc = await admin.firestore().collection("config").doc("me_tokens").get();
    if (!doc.exists) return ok(res, { autorizado: false });

    const { expires_at, authorized_at } = doc.data();
    return ok(res, {
      autorizado:    true,
      expires_at,
      authorized_at: authorized_at?.toDate?.() || null,
    });
  } catch (e) {
    return fail(res, e.message, 500);
  }
});

// ─── POST /frete/auth ─────────────────────────────────────────────────────────
// Recebe o authorization_code do OAuth do Melhor Envio e salva o token
router.post("/auth", async (req, res) => {
  const { code } = req.body;
  if (!code) return fail(res, "Parâmetro 'code' é obrigatório.");
  try {
    const tokens = await exchangeMECode(code);
    return ok(res, {
      message:    "Melhor Envio autorizado com sucesso!",
      expires_at: tokens.expires_at,
    });
  } catch (e) {
    console.error("ME auth error:", e.response?.data || e.message);
    const msg = e.response?.data?.message || e.response?.data?.error || e.message;
    return fail(res, msg, 502);
  }
});

// ─── POST /frete/calcular ─────────────────────────────────────────────────────
// Calcula opções de frete pelo Melhor Envio
router.post("/calcular", async (req, res) => {
  const { cepDestino, pesoKg, altura, largura, comprimento, valorSeguro } = req.body;

  if (!cepDestino) return fail(res, "CEP de destino é obrigatório.");
  const cep = String(cepDestino).replace(/\D/g, "");
  if (cep.length !== 8) return fail(res, "CEP inválido — deve ter 8 dígitos.");
  if (!pesoKg || pesoKg <= 0) return fail(res, "Peso inválido — informe o peso em kg.");

  try {
    const opcoes = await calculateShipping({
      cepDestino:  cep,
      pesoKg,
      altura:      altura      || 10,
      largura:     largura     || 15,
      comprimento: comprimento || 20,
      valorSeguro: valorSeguro || 0,
    });
    return ok(res, { opcoes });
  } catch (e) {
    console.error("ME calc error:", e.response?.data || e.message);
    const msg = e.response?.data?.message || e.response?.data?.error || e.message;
    return fail(res, msg, 502);
  }
});

module.exports = router;
