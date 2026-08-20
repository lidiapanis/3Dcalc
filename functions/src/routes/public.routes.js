/**
 * Rotas PÚBLICAS (sem autenticação) — captação de clientes na landing de evento.
 *
 *   GET  /landing-info?e={empresaId}&ev={eventoId}
 *        → { eventoNome, eventoStatus, branding } — só identidade visual + nome do evento.
 *
 *   POST /cadastro-publico  { e, ev, nome, telefone, email, website(honeypot) }
 *        → grava a pessoa como cliente vinculada ao evento, via Admin SDK (sem abrir
 *          escrita anônima no RTDB). Dedup por empresa+telefone; anti-spam por honeypot.
 *
 * Multi-tenant: tudo sob /empresas/{e}/. O Admin SDK ignora as regras do RTDB, então
 * não é preciso (nem desejável) liberar escrita anônima nas regras.
 */
const express = require("express");
const router  = express.Router();
const admin   = require("firebase-admin");

const ok   = (res, data)              => res.json({ success: true, data });
const fail = (res, msg, status = 400) => res.status(status).json({ success: false, error: msg });

const digits = (s) => String(s == null ? "" : s).replace(/\D/g, "");
const clean  = (s, max = 200) => String(s == null ? "" : s).trim().slice(0, max);
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const eventoEncerrado = (st) => st === "encerrado" || st === "cancelado";

// Só os campos de identidade visual — nunca outros dados da empresa.
function brandingPublico(data) {
  const b = (data && data.branding) || null;
  if (!b) return null;
  return {
    logoUrl:       b.logoUrl       || null,
    corPrimaria:   b.corPrimaria   || null,
    corSecundaria: b.corSecundaria || null,
    corDestaque:   b.corDestaque   || null,
  };
}

// ─── GET /landing-info ────────────────────────────────────────────────────────
router.get("/landing-info", async (req, res) => {
  const e  = clean(req.query.e, 64);
  const ev = clean(req.query.ev, 64);
  if (!e || !ev) return fail(res, "Link inválido: parâmetros 'e' e 'ev' são obrigatórios.");

  try {
    const evSnap = await admin.database().ref(`empresas/${e}/eventos/${ev}`).once("value");
    if (!evSnap.exists()) return fail(res, "Evento não encontrado.", 404);
    const evento = evSnap.val() || {};
    if (eventoEncerrado(evento.status)) return fail(res, "Este evento já foi encerrado.", 410);

    let branding = null;
    try {
      const doc = await admin.firestore().doc(`empresas/${e}`).get();
      branding = doc.exists ? brandingPublico(doc.data()) : null;
    } catch (_) { /* sem branding → landing usa o fallback KOMBINEI */ }

    return ok(res, {
      eventoNome:   evento.nome || ("Evento #" + ev),
      eventoStatus: evento.status || null,
      flyerUrl:     evento.flyerUrl || null,
      branding,
    });
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

// ─── POST /cadastro-publico ───────────────────────────────────────────────────
router.post("/cadastro-publico", async (req, res) => {
  const b = req.body || {};

  // Honeypot: bots costumam preencher campos ocultos → finge sucesso e ignora.
  if (clean(b.website)) return ok(res, { ignorado: true });

  const e   = clean(b.e, 64);
  const ev  = clean(b.ev, 64);
  const nome = clean(b.nome, 120);
  const telefoneRaw = clean(b.telefone, 30);
  const telDigits   = digits(telefoneRaw);
  const email = clean(b.email, 160);

  if (!e || !ev)  return fail(res, "Link inválido (empresa/evento ausentes).");
  if (!nome)      return fail(res, "Informe o nome.");
  if (telDigits.length < 10 || telDigits.length > 11) return fail(res, "Telefone inválido. Use DDD + número.");
  if (email && !emailValido(email)) return fail(res, "E-mail inválido.");

  try {
    const db = admin.database();

    const evSnap = await db.ref(`empresas/${e}/eventos/${ev}`).once("value");
    if (!evSnap.exists()) return fail(res, "Evento não encontrado.", 404);
    const evento = evSnap.val() || {};
    if (eventoEncerrado(evento.status)) return fail(res, "Este evento já foi encerrado.", 410);
    const eventoNome = evento.nome || ("Evento #" + ev);

    // Dedup por empresa + telefone (compara só os dígitos)
    const pessoasSnap = await db.ref(`empresas/${e}/pessoas`).once("value");
    let existenteKey = null, existenteVal = null;
    pessoasSnap.forEach((c) => {
      const d = c.val() || {};
      if (telDigits && digits(d.telefone) === telDigits) { existenteKey = c.key; existenteVal = d; }
    });

    if (existenteKey) {
      // Já existe (dedup por telefone): só completa o eventoOrigem se estiver vazio.
      // Não alteramos o papel (tipo) de quem já está cadastrado — sem criar 'ambos'.
      const upd = {};
      if (!existenteVal.eventoOrigemId) {
        upd.eventoOrigemId   = ev;
        upd.eventoOrigemNome = eventoNome;
      }
      if (Object.keys(upd).length) await db.ref(`empresas/${e}/pessoas/${existenteKey}`).update(upd);
      return ok(res, { duplicado: true, id: existenteKey, message: "Você já estava cadastrado — obrigado!" });
    }

    // Novo cadastro: ID sequencial transacional
    const txn = await db.ref(`empresas/${e}/contador_pessoas/proximoId`).transaction((cur) => (cur === null ? 1 : cur + 1));
    const novoId = txn.snapshot.val();

    const pessoa = {
      idSequencial:     novoId,
      nome,
      telefone:         telefoneRaw,
      email:            email || "",
      documento:        "",
      endereco:         "",
      cep:              "",
      observacoes:      "",
      tipo:             "cliente",
      tipos:            { cliente: true, fornecedor: false },
      eventoOrigemId:   ev,
      eventoOrigemNome: eventoNome,
      origem:           "landing_evento",
      dataCriacao:      new Date().toISOString(),
    };
    await db.ref(`empresas/${e}/pessoas/${novoId}`).set(pessoa);
    return ok(res, { id: novoId, message: "Cadastro realizado com sucesso!" });
  } catch (err) {
    return fail(res, err.message, 500);
  }
});

module.exports = router;
