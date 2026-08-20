/* etiqueta.js — Etiqueta de produto compartilhada (Niimbot D110, 15×30mm).
 *
 * Layout (proporção 2:1, landscape — casa com a etiqueta 30×15mm da D110):
 *   1) NOME DO PRODUTO  — fonte reduz automaticamente se for grande (trunca em último caso)
 *   2) VALOR DE VENDA   — destaque
 *   3) Código de barras — com o número embaixo (EAN-13 ou CODE128)
 *
 * Requer JsBarcode carregado na página. Injeta o próprio modal.
 * API:  Etiqueta.abrir({ code, nome, preco })
 *
 * Impressão na Niimbot D110: o caminho recomendado no celular é o botão
 * "Enviar para impressora", que compartilha o PNG para o app Niimbot (Web Share API).
 * Também há "Baixar PNG" e "Imprimir" (impressoras comuns / desktop).
 */
(function () {
  "use strict";

  let overlay, previewEl, erroEl, shareBtn;
  let curCanvas = null, curCode = '';

  function fmtPreco(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return '';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function ean13CheckDigit(d12) { let s = 0; for (let i = 0; i < 12; i++) { const n = +d12[i]; s += (i % 2 === 0) ? n : n * 3; } return String((10 - (s % 10)) % 10); }
  function ean13Valido(code) { return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12]; }
  function formato(code) { return ean13Valido(code) ? 'EAN13' : 'CODE128'; }

  // iOS (iPhone/iPad): o app Niimbot NÃO registra extensão de compartilhamento,
  // então nunca aparece no menu "Enviar". O caminho é salvar nas Fotos e importar
  // pela galeria no app. Detecta inclusive iPadOS (que se identifica como Mac).
  function isIOS() {
    return /iP(hone|od|ad)/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function ajustarFonte(ctx, texto, maxW, fMax, fMin) {
    let f = fMax; ctx.font = 'bold ' + f + 'px Arial';
    while (ctx.measureText(texto).width > maxW && f > fMin) { f -= 1; ctx.font = 'bold ' + f + 'px Arial'; }
    return f;
  }
  function truncar(ctx, texto, maxW) {
    if (ctx.measureText(texto).width <= maxW) return texto;
    let t = texto;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  // Monta a etiqueta num canvas de alta resolução (proporção 30×15mm = 2:1).
  function montarCanvas(o) {
    const code = (o.code || '').trim();
    if (!code) throw new Error('Produto sem código de barras.');
    if (!window.JsBarcode) throw new Error('Biblioteca de etiqueta não carregada. Verifique a conexão.');
    const nome = (o.nome || '').trim();
    const precoTxt = fmtPreco(o.preco);

    const W = 540, H = 270, pad = 16;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    const maxW = W - pad * 2;
    let y = pad;

    // 1) NOME — fonte reduz se necessário (38→20px), trunca em último caso
    if (nome) {
      const f = ajustarFonte(ctx, nome, maxW, 38, 20);
      ctx.font = 'bold ' + f + 'px Arial';
      ctx.fillText(truncar(ctx, nome, maxW), W / 2, y + f * 0.6);
      y += f + 12;
    }
    // 2) VALOR DE VENDA — destaque
    if (precoTxt) {
      ctx.font = 'bold 42px Arial';
      ctx.fillText(precoTxt, W / 2, y + 24);
      y += 54;
    }
    // 3) Código de barras — ocupa o espaço restante (encaixa em largura e altura)
    const bc = document.createElement('canvas');
    JsBarcode(bc, code, { format: formato(code), displayValue: true, fontSize: 18, height: 70, margin: 4, width: 2 });
    const availH = H - pad - y;
    const scale = Math.min(maxW / bc.width, availH / bc.height);
    const dispW = bc.width * scale, dispH = bc.height * scale;
    ctx.drawImage(bc, (W - dispW) / 2, y + (availH - dispH) / 2, dispW, dispH);

    return canvas;
  }

  // ── Modal (auto-injetado) ──
  function injetar() {
    if (overlay) return;
    const style = document.createElement('style');
    style.textContent = [
      '.etq2-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:99999;padding:16px;font-family:Arial,sans-serif;}',
      '.etq2-bg.open{display:flex;}',
      '.etq2-modal{background:#fff;border-radius:12px;max-width:440px;width:100%;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.35);text-align:center;}',
      '.etq2-modal h3{margin:0 0 12px;color:#333;font-size:1.1em;}',
      '.etq2-preview{display:flex;justify-content:center;align-items:center;min-height:130px;background:#fff;border:1px solid #eee;border-radius:8px;padding:10px;overflow:auto;}',
      '.etq2-preview canvas{max-width:100%;height:auto;}',
      '.etq2-hint{font-size:.78em;color:#888;margin:8px 0 0;line-height:1.4;}',
      '.etq2-erro{color:#dc3545;font-size:.85em;min-height:1em;margin:6px 0 0;}',
      '.etq2-foot{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;}',
      '.etq2-btn{border:none;border-radius:8px;padding:11px 15px;cursor:pointer;font-weight:600;font-size:.92em;min-height:44px;color:#fff;display:inline-flex;align-items:center;gap:7px;}',
      '.etq2-share{background:#28a745;}.etq2-png{background:#4A93B0;}.etq2-print{background:#6741D9;}.etq2-close{background:#eee;color:#555;}'
    ].join('');
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'etq2-bg';
    overlay.innerHTML =
      '<div class="etq2-modal">' +
        '<h3><i class="fas fa-tag" style="color:#4A93B0;"></i> Etiqueta do produto</h3>' +
        '<div class="etq2-preview" id="etq2Preview"></div>' +
        '<p class="etq2-erro" id="etq2Erro"></p>' +
        (isIOS()
          ? '<p class="etq2-hint">No iPhone/iPad o app <b>Niimbot</b> não aparece no menu de compartilhar. Toque em <b>Enviar para impressora</b> → <b>Salvar Imagem</b>, depois abra o app <b>Niimbot</b> e importe a foto da galeria (etiqueta 15×30mm).</p>'
          : '<p class="etq2-hint">Para a Niimbot D110: toque em <b>Enviar para impressora</b> e escolha o app <b>Niimbot</b> (etiqueta 15×30mm).</p>') +
        '<div class="etq2-foot">' +
          '<button type="button" class="etq2-btn etq2-close">Fechar</button>' +
          '<button type="button" class="etq2-btn etq2-png"><i class="fas fa-download"></i> Baixar PNG</button>' +
          '<button type="button" class="etq2-btn etq2-print"><i class="fas fa-print"></i> Imprimir</button>' +
          '<button type="button" class="etq2-btn etq2-share" id="etq2Share"><i class="fas fa-share-nodes"></i> Enviar para impressora</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    previewEl = overlay.querySelector('#etq2Preview');
    erroEl = overlay.querySelector('#etq2Erro');
    shareBtn = overlay.querySelector('#etq2Share');

    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    overlay.querySelector('.etq2-close').addEventListener('click', fechar);
    overlay.querySelector('.etq2-png').addEventListener('click', baixarPNG);
    overlay.querySelector('.etq2-print').addEventListener('click', imprimir);
    shareBtn.addEventListener('click', compartilhar);

    // Web Share com arquivos (mobile): botão só aparece quando suportado
    if (!(navigator.canShare && typeof navigator.share === 'function')) {
      shareBtn.style.display = 'none';
    }
  }

  function fechar() { if (overlay) overlay.classList.remove('open'); }

  function baixarPNG() {
    if (!curCanvas) return;
    const a = document.createElement('a');
    a.href = curCanvas.toDataURL('image/png');
    a.download = 'etiqueta-' + (curCode || 'produto') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function imprimir() {
    if (!curCanvas) return;
    const dataUrl = curCanvas.toDataURL('image/png');
    // Imprime por um iframe oculto NA PRÓPRIA página (não abre janela nova).
    // Janela nova em PWA standalone fica sem barra do navegador → ao cancelar a
    // impressão o usuário ficava preso na tela da etiqueta sem botão de voltar.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;';
    document.body.appendChild(iframe);
    const limpar = () => { if (iframe.parentNode) iframe.remove(); };
    const idoc = iframe.contentWindow.document;
    idoc.open();
    idoc.write('<!DOCTYPE html><html><head><style>@page{margin:4mm}html,body{margin:0}img{max-width:100%}</style></head><body><img src="' + dataUrl + '"></body></html>');
    idoc.close();
    const img = idoc.querySelector('img');
    const disparar = () => {
      try {
        iframe.contentWindow.onafterprint = limpar; // remove ao fechar/cancelar o diálogo
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) { limpar(); }
      setTimeout(limpar, 60000); // rede de segurança se onafterprint não disparar
    };
    if (img.complete) disparar(); else img.onload = disparar;
  }

  function compartilhar() {
    if (!curCanvas) return;
    curCanvas.toBlob(async (blob) => {
      if (!blob) { erroEl.textContent = 'Falha ao gerar a imagem.'; return; }
      const file = new File([blob], 'etiqueta-' + (curCode || 'produto') + '.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          // Compartilha SÓ o arquivo: incluir title/text faz o seletor do Android
          // procurar apps que aceitem texto+imagem e esconder receptores só-imagem
          // (ex.: Niimbot), que somem da lista "mesmo instalados".
          await navigator.share({ files: [file] });
        } else {
          baixarPNG();   // fallback: baixa o PNG p/ importar manualmente no app
          erroEl.textContent = 'Compartilhamento de arquivo não suportado aqui — baixei o PNG para você importar no app Niimbot.';
        }
      } catch (e) { /* usuário cancelou */ }
    }, 'image/png');
  }

  window.Etiqueta = {
    abrir: function (o) {
      injetar();
      erroEl.textContent = '';
      previewEl.innerHTML = '';
      curCanvas = null;
      curCode = (o && o.code ? String(o.code).trim() : '');
      try {
        curCanvas = montarCanvas(o || {});
        previewEl.appendChild(curCanvas);
      } catch (e) {
        erroEl.textContent = e.message;
      }
      overlay.classList.add('open');
    }
  };
})();
