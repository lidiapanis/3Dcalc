/* barcode.js — Leitor de código de barras compartilhado (KOMBINEI)
 *
 * Inclua DEPOIS dos SDKs/empresa.js. Injeta seu próprio modal e CSS.
 *
 * API:
 *   Barcode.isSupported()            -> boolean (getUserMedia disponível)
 *   Barcode.open({ continuous, onCode, title, hint })
 *   Barcode.close()
 *
 *   onCode(code, ui):
 *     ui.setStatus(msg, kind)   kind: 'ok' | 'warn' | 'err'
 *     ui.flash(kind)            pisca a moldura (com vibração)
 *
 * Estratégia: usa a API nativa BarcodeDetector quando existir (Android/Chrome);
 * faz fallback para a lib ZXing carregada de CDN (Safari/iOS, sem BarcodeDetector).
 * Câmera exige HTTPS. Trata permissão negada / sem câmera com mensagens claras.
 */
(function () {
  "use strict";

  const ZXING_SRC = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
  // Formatos típicos de varejo + QR (inofensivo se o dispositivo não suportar)
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];

  let overlay, videoEl, statusEl, frameEl, titleEl, hintEl, retryBtn;
  let stream = null, detector = null, zxingReader = null, rafId = null, running = false;
  let opts = null, lastCode = '', lastTime = 0, zxingLoading = null;

  function injectDom() {
    if (overlay) return;
    const style = document.createElement('style');
    style.textContent = `
      .bc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:none;
        flex-direction:column;align-items:center;justify-content:center;padding:16px;
        padding-top:calc(16px + env(safe-area-inset-top));padding-bottom:calc(16px + env(safe-area-inset-bottom));
        font-family:'Segoe UI',Arial,sans-serif;}
      .bc-overlay.open{display:flex;}
      .bc-box{width:100%;max-width:480px;display:flex;flex-direction:column;gap:12px;}
      .bc-head{display:flex;align-items:center;justify-content:space-between;color:#fff;font-weight:700;font-size:1.05em;}
      .bc-close{background:rgba(255,255,255,.18);color:#fff;border:none;border-radius:8px;width:42px;height:42px;
        font-size:1.5em;line-height:1;cursor:pointer;flex-shrink:0;}
      .bc-close:active{background:rgba(255,255,255,.35);}
      .bc-stage{position:relative;width:100%;aspect-ratio:3/4;max-height:58vh;background:#000;border-radius:14px;overflow:hidden;}
      .bc-video{width:100%;height:100%;object-fit:cover;display:block;}
      .bc-frame{position:absolute;inset:20% 10%;border:3px solid rgba(255,255,255,.9);border-radius:12px;
        box-shadow:0 0 0 9999px rgba(0,0,0,.28);pointer-events:none;transition:border-color .12s;}
      .bc-frame.ok{border-color:#28a745;} .bc-frame.warn{border-color:#f0ad4e;} .bc-frame.err{border-color:#e74c3c;}
      .bc-hint{color:#cfe3ec;text-align:center;font-size:.9em;min-height:1.1em;}
      .bc-status{color:#fff;text-align:center;font-size:1.02em;font-weight:600;min-height:1.3em;}
      .bc-status.ok{color:#7ee29a;} .bc-status.warn{color:#f7c46b;} .bc-status.err{color:#f3897e;}
      .bc-retry{display:none;background:#4A93B0;color:#fff;border:none;border-radius:9px;padding:14px;
        font-weight:700;font-size:1em;cursor:pointer;min-height:50px;}
      .bc-retry:active{background:#3A7A96;}
    `;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'bc-overlay';
    overlay.innerHTML =
      '<div class="bc-box">' +
        '<div class="bc-head"><span class="bc-title">Ler código de barras</span>' +
          '<button class="bc-close" aria-label="Fechar">&times;</button></div>' +
        '<div class="bc-stage"><video class="bc-video" playsinline muted autoplay></video><div class="bc-frame"></div></div>' +
        '<div class="bc-hint"></div>' +
        '<div class="bc-status"></div>' +
        '<button class="bc-retry">Tentar novamente</button>' +
      '</div>';
    document.body.appendChild(overlay);

    videoEl = overlay.querySelector('.bc-video');
    statusEl = overlay.querySelector('.bc-status');
    frameEl = overlay.querySelector('.bc-frame');
    titleEl = overlay.querySelector('.bc-title');
    hintEl = overlay.querySelector('.bc-hint');
    retryBtn = overlay.querySelector('.bc-retry');
    overlay.querySelector('.bc-close').addEventListener('click', function () { api.close(); });
    retryBtn.addEventListener('click', function () { start(); });
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'bc-status' + (kind ? ' ' + kind : '');
  }
  function flash(kind) {
    frameEl.className = 'bc-frame' + (kind ? ' ' + kind : '');
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { frameEl.className = 'bc-frame'; }, 350);
  }
  const ui = { setStatus: setStatus, flash: function (k) { flash(k || 'ok'); } };

  function loadZxing() {
    if (window.ZXing && window.ZXing.BrowserMultiFormatReader) return Promise.resolve();
    if (zxingLoading) return zxingLoading;
    zxingLoading = new Promise(function (res, rej) {
      const s = document.createElement('script');
      s.src = ZXING_SRC; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { zxingLoading = null; rej(new Error('lib')); };
      document.head.appendChild(s);
    });
    return zxingLoading;
  }

  function msgErro(e) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'Câmera não disponível neste dispositivo.';
    const n = e && (e.name || e.code);
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError')
      return 'Permissão de câmera negada. Autorize o acesso à câmera e toque em “Tentar novamente”.';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError')
      return 'Nenhuma câmera encontrada neste dispositivo.';
    if (n === 'NotReadableError' || n === 'TrackStartError')
      return 'Não foi possível acessar a câmera (pode estar em uso por outro app).';
    return 'Erro ao abrir a câmera. ' + (e && e.message ? e.message : '');
  }

  function stopMyStream() {
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); stream = null; }
  }

  async function start() {
    retryBtn.style.display = 'none';
    setStatus('Iniciando câmera…');
    teardown();           // limpa qualquer leitura anterior
    running = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(msgErro({}), 'err'); return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      setStatus(msgErro(e), 'err'); retryBtn.style.display = 'block'; return;
    }
    if (!running) { stopMyStream(); return; }   // fechou durante a permissão
    videoEl.srcObject = stream;
    try { await videoEl.play(); } catch (e) {}
    lastCode = ''; lastTime = 0;

    // 1) BarcodeDetector nativo
    if ('BarcodeDetector' in window) {
      try {
        let fmts = FORMATS;
        if (window.BarcodeDetector.getSupportedFormats) {
          const sup = await window.BarcodeDetector.getSupportedFormats();
          const inter = FORMATS.filter(function (f) { return sup.indexOf(f) !== -1; });
          fmts = inter.length ? inter : sup;
        }
        detector = new window.BarcodeDetector({ formats: fmts });
        setStatus(opts.continuous ? 'Pronto — aponte para os códigos' : 'Aponte para o código');
        loopNative();
        return;
      } catch (e) { detector = null; /* cai para o ZXing */ }
    }

    // 2) Fallback ZXing (iOS/Safari e afins)
    setStatus('Carregando leitor…');
    try { await loadZxing(); }
    catch (e) { setStatus('Não foi possível carregar o leitor de código. Verifique a conexão.', 'err'); retryBtn.style.display = 'block'; return; }
    if (!running) return;
    try {
      zxingReader = new window.ZXing.BrowserMultiFormatReader();
      const onResult = function (result) {
        if (result && running) handleCode(result.getText ? result.getText() : result.text);
      };
      setStatus(opts.continuous ? 'Pronto — aponte para os códigos' : 'Aponte para o código');
      if (typeof zxingReader.decodeFromStream === 'function') {
        zxingReader.decodeFromStream(stream, videoEl, onResult);
      } else if (typeof zxingReader.decodeFromConstraints === 'function') {
        stopMyStream();   // o ZXing abre/gerencia a própria stream
        zxingReader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoEl, onResult);
      } else {
        zxingReader.decodeFromVideoDevice(undefined, videoEl, onResult);
      }
    } catch (e) {
      setStatus('Erro no leitor: ' + (e.message || ''), 'err'); retryBtn.style.display = 'block';
    }
  }

  async function loopNative() {
    if (!running || !detector) return;
    try {
      const codes = await detector.detect(videoEl);
      if (codes && codes.length) handleCode(codes[0].rawValue);
    } catch (e) { /* frame inválido — ignora */ }
    if (running && detector) rafId = requestAnimationFrame(function () { setTimeout(loopNative, 120); });
  }

  function handleCode(code) {
    code = (code || '').trim();
    if (!code || !running) return;
    const now = Date.now();
    if (code === lastCode && (now - lastTime) < 1500) return;   // debounce de repetição
    lastCode = code; lastTime = now;
    if (opts.continuous) {
      flash('ok');
      try { opts.onCode(code, ui); } catch (e) {}
    } else {
      flash('ok');
      const cb = opts.onCode;
      api.close();
      try { cb(code, ui); } catch (e) {}
    }
  }

  function teardown() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (zxingReader) { try { zxingReader.reset(); } catch (e) {} zxingReader = null; }
    detector = null;
    stopMyStream();
    if (videoEl) { try { videoEl.pause(); videoEl.srcObject = null; } catch (e) {} }
  }

  function onKey(e) { if (e.key === 'Escape') api.close(); }

  const api = {
    isSupported: function () { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    open: function (o) {
      opts = Object.assign({ continuous: false, onCode: function () {}, title: 'Ler código de barras', hint: '' }, o || {});
      injectDom();
      titleEl.textContent = opts.title;
      hintEl.textContent = opts.hint || (opts.continuous ? 'Escaneie vários itens em sequência.' : 'Posicione o código dentro da área.');
      setStatus('');
      frameEl.className = 'bc-frame';
      overlay.classList.add('open');
      document.addEventListener('keydown', onKey);
      start();
    },
    close: function () {
      teardown();
      if (overlay) overlay.classList.remove('open');
      document.removeEventListener('keydown', onKey);
    }
  };

  window.Barcode = api;
})();
