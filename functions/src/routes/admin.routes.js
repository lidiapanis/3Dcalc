/**
 * admin.routes.js — API multi-tenant (empresas, licenças, usuários, permissões).
 *
 * Todos os endpoints (exceto /setup-inicial e /migrar-init) exigem
 * token JWT de superadmin no header Authorization: Bearer <token>.
 */

const express = require("express");
const admin   = require("firebase-admin");
const svc     = require("../services/admin.service");

const router = express.Router();

// ─── Middleware: token JWT + role superadmin ──────────────────────────────────

async function requireSuperAdmin(req, res, next) {
  try {
    const auth  = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token não fornecido." });
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.role !== "superadmin") {
      return res.status(403).json({ error: "Acesso negado. Apenas superadmin." });
    }
    req.adminUser = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token inválido: " + err.message });
  }
}

// ─── Bootstrap Inicial ────────────────────────────────────────────────────────

router.post("/setup-inicial", async (req, res) => {
  try {
    const snap = await admin.firestore().collection("empresas").doc("1").get();
    if (snap.exists) return res.status(409).json({ error: "Sistema já foi inicializado." });
    const { superadminEmail, superadminPassword } = req.body;
    if (!superadminEmail || !superadminPassword) {
      return res.status(400).json({ error: "superadminEmail e superadminPassword são obrigatórios." });
    }
    const result = await svc.bootstrapInicial({ superadminEmail, superadminPassword });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[admin] setup-inicial:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Migração inicial (token simples, uso único) ──────────────────────────────

const MIGRATION_ONCE_TOKEN = "kombinei_migrate_2026";

router.post("/migrar-init", async (req, res) => {
  try {
    const { token } = req.body;
    if (token !== MIGRATION_ONCE_TOKEN) return res.status(403).json({ error: "Token inválido." });
    const snap = await admin.firestore().collection("empresas").doc("1").get();
    if (!snap.exists) return res.status(409).json({ error: "Execute setup-inicial primeiro." });
    const log = await svc.migrarDadosParaEmpresa1();
    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Metadados ────────────────────────────────────────────────────────────────

router.get("/modulos", requireSuperAdmin, (req, res) => {
  res.json({ modulos: svc.MODULOS, planos: svc.PLANOS });
});

// ─── Empresas ─────────────────────────────────────────────────────────────────

router.get("/empresas", requireSuperAdmin, async (req, res) => {
  try { res.json({ empresas: await svc.listarEmpresas() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/empresas", requireSuperAdmin, async (req, res) => {
  try {
    const { nome, plano, licencaExpira } = req.body;
    if (!nome) return res.status(400).json({ error: "nome é obrigatório." });
    res.json({ success: true, empresa: await svc.criarEmpresa({ nome, plano, licencaExpira }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle ativo/inativo
router.patch("/empresas/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { ativo } = req.body;
    if (typeof ativo !== "boolean") return res.status(400).json({ error: "ativo (boolean) é obrigatório." });
    res.json({ success: true, ...(await svc.toggleAtivoEmpresa(req.params.id, ativo)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualiza plano + data de expiração
router.put("/empresas/:id/licenca", requireSuperAdmin, async (req, res) => {
  try {
    const { plano, licencaExpira } = req.body;
    if (plano === undefined && licencaExpira === undefined) {
      return res.status(400).json({ error: "plano ou licencaExpira são necessários." });
    }
    res.json({ success: true, ...(await svc.atualizarLicenca(req.params.id, { plano, licencaExpira })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Usuários ─────────────────────────────────────────────────────────────────

router.get("/usuarios", requireSuperAdmin, async (req, res) => {
  try {
    const { empresaId } = req.query;
    if (!empresaId) return res.status(400).json({ error: "empresaId é obrigatório." });
    res.json({ usuarios: await svc.listarUsuarios(empresaId) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/usuarios", requireSuperAdmin, async (req, res) => {
  try {
    const { email, password, empresaId, role, permissoes } = req.body;
    if (!email || !password || !empresaId) {
      return res.status(400).json({ error: "email, password e empresaId são obrigatórios." });
    }
    res.json({ success: true, usuario: await svc.criarUsuario({ email, password, empresaId, role, permissoes }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle ativo do usuário
router.patch("/usuarios/:uid/ativo", requireSuperAdmin, async (req, res) => {
  try {
    const { ativo } = req.body;
    if (typeof ativo !== "boolean") return res.status(400).json({ error: "ativo (boolean) é obrigatório." });
    res.json({ success: true, ...(await svc.toggleAtivoUsuario(req.params.uid, ativo)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualiza permissões por módulo
router.put("/usuarios/:uid/permissoes", requireSuperAdmin, async (req, res) => {
  try {
    const { permissoes } = req.body;
    if (!permissoes || typeof permissoes !== "object") {
      return res.status(400).json({ error: "permissoes (object) é obrigatório." });
    }
    res.json({ success: true, ...(await svc.atualizarPermissoes(req.params.uid, permissoes)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Migração (autenticado) ────────────────────────────────────────────────────

router.post("/migrar", requireSuperAdmin, async (req, res) => {
  try {
    const log = await svc.migrarDadosParaEmpresa1();
    res.json({ success: true, log });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
