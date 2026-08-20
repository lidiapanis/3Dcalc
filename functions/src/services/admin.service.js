/**
 * admin.service.js — Lógica de negócio para multi-tenant.
 *
 * Gerencia: empresas, licenças, usuários, permissões por módulo e migração.
 */

const admin = require("firebase-admin");

const db   = () => admin.firestore();
const rtdb = () => admin.database();

const PLANOS  = ["trial", "basico", "pro"];
const MODULOS = ["dashboard", "produtos", "clientes", "orcamentos", "ml", "configuracoes"];

// ─── Permissões padrão ────────────────────────────────────────────────────────

function permissoesDefault() {
  return Object.fromEntries(MODULOS.map((m) => [m, true]));
}

function normalizarPermissoes(raw) {
  const out = {};
  MODULOS.forEach((m) => {
    out[m] = raw && raw[m] !== false;
  });
  return out;
}

// ─── Bootstrap Inicial ────────────────────────────────────────────────────────

async function bootstrapInicial({ superadminEmail, superadminPassword }) {
  // 1. Cria empresa 1 no Firestore
  const empresaRef = db().collection("empresas").doc("1");
  if (!(await empresaRef.get()).exists) {
    await empresaRef.set({
      id:           "1",
      nome:         "Kombinei",
      ativo:        true,
      plano:        "pro",
      licencaExpira: null,
      criadoEm:     admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("[admin] Empresa 1 (Kombinei) criada.");
  }

  // 2. Cria ou localiza o usuário superadmin
  let uid;
  try {
    const existing = await admin.auth().getUserByEmail(superadminEmail);
    uid = existing.uid;
  } catch {
    const newUser = await admin.auth().createUser({
      email: superadminEmail, password: superadminPassword, emailVerified: true,
    });
    uid = newUser.uid;
  }

  const perms = permissoesDefault();

  // 3. Custom Claims
  await admin.auth().setCustomUserClaims(uid, {
    empresaId: "1", role: "superadmin", ativo: true, permissoes: perms,
  });

  // 4. Firestore /usuarios/{uid}
  await db().collection("usuarios").doc(uid).set(
    { uid, email: superadminEmail, empresaId: "1", role: "superadmin",
      ativo: true, permissoes: perms, criadoEm: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  // 5. Migra dados existentes
  const migrationLog = await migrarDadosParaEmpresa1();
  console.log("[admin] Migração:", migrationLog.join("; "));

  return { uid, empresaId: "1", role: "superadmin", migrationLog };
}

// ─── Empresas ─────────────────────────────────────────────────────────────────

async function listarEmpresas() {
  const snap = await db().collection("empresas").orderBy("id").get();
  return snap.docs.map((d) => _serializarEmpresa(d.data()));
}

async function criarEmpresa({ nome, plano = "trial", licencaExpira = null }) {
  const snap = await db().collection("empresas").orderBy("id", "desc").limit(1).get();
  const ultimoId = snap.empty ? 0 : parseInt(snap.docs[0].data().id || "0", 10);
  const novoId   = String(ultimoId + 1);

  const dados = {
    id:           novoId,
    nome,
    ativo:        true,
    plano:        PLANOS.includes(plano) ? plano : "trial",
    licencaExpira: licencaExpira
      ? admin.firestore.Timestamp.fromDate(new Date(licencaExpira))
      : null,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db().collection("empresas").doc(novoId).set(dados);
  return _serializarEmpresa(dados);
}

async function atualizarLicenca(empresaId, { plano, licencaExpira }) {
  const updates = {};
  if (plano !== undefined) {
    updates.plano = PLANOS.includes(plano) ? plano : "trial";
  }
  if (licencaExpira !== undefined) {
    if (licencaExpira) {
      const dt = new Date(licencaExpira);
      updates.licencaExpira = admin.firestore.Timestamp.fromDate(dt);
      // Auto-desativa se já venceu
      if (dt < new Date()) updates.ativo = false;
    } else {
      updates.licencaExpira = null;
    }
  }
  await db().collection("empresas").doc(String(empresaId)).update(updates);
  return { empresaId, ...updates };
}

async function toggleAtivoEmpresa(empresaId, ativo) {
  await db().collection("empresas").doc(String(empresaId)).update({ ativo });
  return { empresaId, ativo };
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

async function listarUsuarios(empresaId) {
  const snap = await db().collection("usuarios")
    .where("empresaId", "==", String(empresaId)).get();
  return snap.docs.map((d) => _serializarUsuario(d.data()));
}

async function criarUsuario({ email, password, empresaId, role = "user", permissoes = null }) {
  let uid;
  try {
    uid = (await admin.auth().getUserByEmail(email)).uid;
  } catch {
    uid = (await admin.auth().createUser({ email, password, emailVerified: false })).uid;
  }

  const perms = normalizarPermissoes(permissoes);

  await admin.auth().setCustomUserClaims(uid, {
    empresaId: String(empresaId), role, ativo: true, permissoes: perms,
  });

  const dados = {
    uid, email, empresaId: String(empresaId), role, ativo: true,
    permissoes: perms, criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db().collection("usuarios").doc(uid).set(dados, { merge: true });
  return _serializarUsuario(dados);
}

async function toggleAtivoUsuario(uid, ativo) {
  const user         = await admin.auth().getUser(uid);
  const currentClaims = user.customClaims || {};
  await admin.auth().setCustomUserClaims(uid, { ...currentClaims, ativo });
  await db().collection("usuarios").doc(uid).update({ ativo });
  return { uid, ativo };
}

async function atualizarPermissoes(uid, permissoes) {
  const perms = normalizarPermissoes(permissoes);
  const user  = await admin.auth().getUser(uid);
  await admin.auth().setCustomUserClaims(uid, { ...(user.customClaims || {}), permissoes: perms });
  await db().collection("usuarios").doc(uid).update({ permissoes: perms });
  return { uid, permissoes: perms };
}

// ─── Verificação diária de licenças expiradas ─────────────────────────────────

async function verificarLicencasExpiradas() {
  const agora   = new Date();
  const snap    = await db().collection("empresas").where("ativo", "==", true).get();
  const expiradas = [];

  for (const doc of snap.docs) {
    const empresa = doc.data();
    if (!empresa.licencaExpira) continue;             // sem prazo = licença vitalícia
    if (empresa.licencaExpira.toDate() > agora) continue; // ainda válida

    // Desativa empresa
    await doc.ref.update({ ativo: false });
    console.log(`[admin] Licença expirada: empresa ${empresa.id} (${empresa.nome}).`);

    // Desativa todos os usuários da empresa
    const usuariosSnap = await db().collection("usuarios")
      .where("empresaId", "==", empresa.id).get();

    for (const userDoc of usuariosSnap.docs) {
      const u = userDoc.data();
      try {
        const authUser = await admin.auth().getUser(u.uid);
        const role = (authUser.customClaims && authUser.customClaims.role) || u.role;
        // Superadmin gerencia todas as empresas — nunca é desativado pela
        // expiração da licença da própria empresa (evita autotranca).
        if (role === "superadmin") {
          console.log(`[admin] Superadmin ${u.uid} preservado na expiração da empresa ${empresa.id}.`);
          continue;
        }
        await admin.auth().setCustomUserClaims(u.uid, {
          ...(authUser.customClaims || {}), ativo: false,
        });
        await userDoc.ref.update({ ativo: false });
      } catch (err) {
        console.warn(`[admin] Erro ao desativar usuário ${u.uid}:`, err.message);
      }
    }

    expiradas.push({ empresaId: empresa.id, nome: empresa.nome });
  }

  console.log(`[admin] Verificação concluída. Licenças expiradas: ${expiradas.length}`);
  return expiradas;
}

// ─── Migração de dados ────────────────────────────────────────────────────────

async function migrarDadosParaEmpresa1() {
  const COLECOES = [
    "produtos", "clientes", "orcamentos", "tags",
    "contador_produtos", "contador_orcamentos", "contador_clientes",
  ];
  const log = [];
  for (const col of COLECOES) {
    const snap = await rtdb().ref(col).once("value");
    if (!snap.exists()) { log.push(`${col}: vazio, pulado.`); continue; }
    const dados = snap.val();
    await rtdb().ref(`empresas/1/${col}`).set(dados);
    log.push(`${col}: OK (${typeof dados === "object" ? Object.keys(dados).length : 1} entradas).`);
  }
  log.push("Migração concluída. Dados originais preservados.");
  return log;
}

// ─── Helpers de serialização (Timestamp → ISO string) ─────────────────────────

function _serializarEmpresa(e) {
  return {
    ...e,
    licencaExpira: e.licencaExpira ? e.licencaExpira.toDate().toISOString() : null,
    criadoEm:      e.criadoEm ? (e.criadoEm.toDate ? e.criadoEm.toDate().toISOString() : e.criadoEm) : null,
  };
}

function _serializarUsuario(u) {
  return {
    ...u,
    criadoEm: u.criadoEm ? (u.criadoEm.toDate ? u.criadoEm.toDate().toISOString() : u.criadoEm) : null,
  };
}

module.exports = {
  bootstrapInicial,
  listarEmpresas,
  criarEmpresa,
  atualizarLicenca,
  toggleAtivoEmpresa,
  listarUsuarios,
  criarUsuario,
  toggleAtivoUsuario,
  atualizarPermissoes,
  verificarLicencasExpiradas,
  migrarDadosParaEmpresa1,
  MODULOS,
  PLANOS,
};
