/* pwa.js — Registro do Service Worker ÚNICO + experiência de instalação.
 * Incluir SOMENTE em páginas de topo (login.html, home.html, pdv/index.html) — nunca
 * dentro do iframe de conteúdo. O SW (escopo "/") cobre todas as telas.
 */
(function () {
  // 1) Registra o SW único na raiz
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  }

  // 2) Install prompt (Android/desktop)
  var deferredPrompt = null;

  function criarBotaoInstalar() {
    if (document.getElementById('pwaInstallBtn')) return document.getElementById('pwaInstallBtn');
    var btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.type = 'button';
    btn.innerHTML = '<i class="fas fa-download"></i> Instalar app';
    btn.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:9999',
      'background:#28a745', 'color:#fff', 'border:none', 'border-radius:24px',
      'padding:12px 18px', 'font:600 0.9em/1 inherit', 'cursor:pointer',
      'box-shadow:0 4px 14px rgba(0,0,0,.3)', 'display:none', 'align-items:center', 'gap:8px',
      'min-height:44px'
    ].join(';');
    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () { deferredPrompt = null; btn.style.display = 'none'; });
    });
    document.body.appendChild(btn);
    return btn;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = criarBotaoInstalar();
    btn.style.display = 'inline-flex';
  });

  window.addEventListener('appinstalled', function () {
    var btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = 'none';
    deferredPrompt = null;
  });

  // 3) iOS/Safari: sem beforeinstallprompt → instrução "Adicionar à Tela de Início"
  function ehIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function emStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  window.addEventListener('load', function () {
    if (!ehIOS() || emStandalone()) return;
    if (localStorage.getItem('pwaIosHintDismissed') === '1') return;
    var bar = document.createElement('div');
    bar.id = 'pwaIosHint';
    bar.style.cssText = [
      'position:fixed', 'left:8px', 'right:8px', 'bottom:8px', 'z-index:9999',
      'background:#1B4C65', 'color:#fff', 'border-radius:12px', 'padding:12px 14px',
      'font:0.85em/1.4 -apple-system,Segoe UI,Arial,sans-serif',
      'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'display:flex', 'align-items:center', 'gap:10px'
    ].join(';');
    bar.innerHTML =
      '<i class="fas fa-arrow-up-from-bracket" style="font-size:1.2em;opacity:.9;"></i>' +
      '<span style="flex:1;">Para instalar: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</span>' +
      '<button id="pwaIosClose" style="background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:8px;width:30px;height:30px;font-size:1.1em;cursor:pointer;">&times;</button>';
    document.body.appendChild(bar);
    document.getElementById('pwaIosClose').addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem('pwaIosHintDismissed', '1'); } catch (e) {}
    });
  });
})();
