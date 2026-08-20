/**
 * empresa.js — Contexto multi-tenant para todas as páginas internas.
 *
 * Inclua APÓS os SDKs do Firebase e ANTES do código da página.
 *
 * API:
 *   initEmpresa()          → Promise<EmpresaCtx | null>
 *   empresaRef(path)       → firebase.database().ref('empresas/{id}/' + path)
 *   isSuperAdmin()         → boolean
 *   temPermissao(modulo)   → boolean
 *   diasAteExpirar()       → number | null  (null = sem prazo)
 *   EmpresaCtx             → { uid, email, empresaId, role, ativo, permissoes }
 */

(function () {
  "use strict";

  let _ctx = null;

  const MODULOS = ["dashboard", "produtos", "clientes", "orcamentos", "ml", "configuracoes"];

  /**
   * Inicializa o contexto de empresa.
   * - Aguarda auth state
   * - Força refresh do ID token (claims atualizados)
   * - Redireciona se não autenticado ou ativo === false
   */
  window.initEmpresa = async function () {
    const user = await new Promise((resolve) => {
      const unsub = firebase.auth().onAuthStateChanged((u) => { unsub(); resolve(u); });
    });

    if (!user) { _redirect("login.html"); return null; }

    const result = await user.getIdTokenResult(true);
    const c = result.claims;

    if (c.ativo === false) {
      await firebase.auth().signOut();
      _redirect("login.html?erro=inativo");
      return null;
    }

    // Normaliza permissões: se não configuradas, libera tudo (retrocompatibilidade)
    const permissoes = {};
    MODULOS.forEach((m) => {
      const raw = c.permissoes ? c.permissoes[m] : undefined;
      permissoes[m] = raw !== false;
    });

    _ctx = {
      uid:       user.uid,
      email:     user.email,
      empresaId: String(c.empresaId || "1"),
      role:      c.role || "user",
      ativo:     c.ativo !== false,
      permissoes,
      licencaExpira: c.licencaExpira || null,
    };

    window.EmpresaCtx = _ctx;
    await carregarBranding(_ctx.empresaId);
    return _ctx;
  };

  // ── Branding por empresa (Firestore /empresas/{id}.branding) ──
  window.EMPRESA_BRANDING = null;

  /**
   * Aplica o branding da empresa: cores como CSS variables (apenas no modo claro,
   * para não quebrar a legibilidade do dark mode) e troca do logo.
   * b = { logoUrl, corPrimaria, corSecundaria, corDestaque } | null
   */
  window.aplicarBranding = function (b) {
    window.EMPRESA_BRANDING = b || null;

    let styleEl = document.getElementById("brandingVars");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "brandingVars";
      document.head.appendChild(styleEl);
    }
    const regras = [];
    if (b && b.corPrimaria)   regras.push("--sidebar-bg:" + b.corPrimaria + ";");
    if (b && b.corSecundaria) regras.push("--sidebar-hover:" + b.corSecundaria + ";--sidebar-active:" + b.corSecundaria + ";");
    if (b && b.corDestaque)   regras.push("--brand:" + b.corDestaque + ";");
    // Escopo :not(dark) → cores custom valem só no modo claro; dark mantém sua paleta
    styleEl.textContent = regras.length ? ('html:not([data-theme="dark"]){' + regras.join("") + "}") : "";

    if (b && b.logoUrl) {
      document.querySelectorAll("#brandLogo, [data-brand-logo]").forEach(function (img) { img.src = b.logoUrl; });
    }
  };

  /** Carrega o branding do Firestore (no-op em páginas sem firebase-firestore). */
  function carregarBranding(empresaId) {
    if (!firebase.firestore) return Promise.resolve();
    return firebase.firestore().doc("empresas/" + empresaId).get()
      .then(function (doc) {
        const b = (doc.exists && doc.data().branding) ? doc.data().branding : null;
        window.aplicarBranding(b);
      })
      .catch(function () { /* mantém o visual padrão */ });
  }

  /**
   * Referência RTDB com prefixo da empresa.
   * Ex.: empresaRef('produtos/123')  →  /empresas/1/produtos/123
   */
  window.empresaRef = function (path) {
    const id = (_ctx && _ctx.empresaId) || "1";
    return firebase.database().ref("empresas/" + id + "/" + String(path).replace(/^\/+/, ""));
  };

  /** True se o usuário logado for superadmin. */
  window.isSuperAdmin = function () {
    return Boolean(_ctx && _ctx.role === "superadmin");
  };

  /**
   * Verifica se o usuário tem acesso ao módulo.
   * superadmin e admin sempre têm acesso a todos os módulos.
   */
  window.temPermissao = function (modulo) {
    if (!_ctx) return false;
    if (_ctx.role === "superadmin" || _ctx.role === "admin") return true;
    return _ctx.permissoes ? _ctx.permissoes[modulo] !== false : true;
  };

  /**
   * Exibe bloco de "acesso negado" no container da página e retorna false,
   * para ser usado como: if (negarAcesso('produtos')) return;
   */
  window.negarAcesso = function (modulo) {
    if (temPermissao(modulo)) return false;
    const c = document.querySelector(".container") || document.body;
    c.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#888;">
        <i class="fas fa-lock" style="font-size:3em;margin-bottom:16px;display:block;color:#ccc;"></i>
        <h3 style="color:#555;margin-bottom:8px;">Acesso restrito</h3>
        <p>Você não tem permissão para acessar este módulo.<br>
        Entre em contato com o administrador da sua empresa.</p>
      </div>`;
    return true;
  };

  /**
   * Dias restantes até expirar a licença (null = sem prazo).
   * Valores negativos = já expirou.
   */
  window.diasAteExpirar = function () {
    if (!_ctx || !_ctx.licencaExpira) return null;
    const expira = new Date(_ctx.licencaExpira);
    return Math.ceil((expira - Date.now()) / (1000 * 60 * 60 * 24));
  };

  function _redirect(url) {
    try { window.top.location.href = url; } catch { window.location.href = url; }
  }
})();
