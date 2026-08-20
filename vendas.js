/* KOMBINEI — Consolidação de vendas (evento + online) — módulo compartilhado
 *
 * Usado por historico_vendas.html e pela seção "Vendas" do dashboard.html.
 * Lê as DUAS fontes e devolve um modelo unificado em memória (uma linha por item):
 *   - Evento: /empresas/{id}/eventos/{ev}/vendas/{pushId}  (ignora status 'cancelada')
 *   - Online: /empresas/{id}/vendas_online/{id}            (importadas da Shopee)
 *
 * Pré-requisito: `empresaRef` global (empresa.js) já com contexto da empresa.
 * Faz UMA leitura de cada nó (produtos/eventos/vendas_online) → sem N+1.
 */
(function (global) {
  'use strict';

  // Parser tolerante: ISO (eventos) e formatos de planilha (Shopee: DD/MM/AAAA etc.).
  function parseData(s) {
    if (!s) return null;
    if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
    s = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/.test(s)) {     // ISO / AAAA-MM-DD
      const d = new Date(s); return isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/); // DD/MM/AAAA
    if (m) {
      const yy = m[3].length === 2 ? ('20' + m[3]) : m[3];
      const d = new Date(+yy, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function nomeDoProduto(prod, fallback) {
    if (prod && (prod.nomeResumido || prod.nomePeca)) return prod.nomeResumido || prod.nomePeca;
    return fallback || null;
  }

  // Chave local AAAA-MM-DD (para agrupar por dia respeitando o fuso do usuário).
  function diaKey(dt) {
    if (!dt) return null;
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  async function carregarConsolidado() {
    const [prodSnap, evSnap, onSnap] = await Promise.all([
      empresaRef('produtos').once('value'),
      empresaRef('eventos').once('value'),
      empresaRef('vendas_online').once('value')
    ]);

    const produtos = {};
    prodSnap.forEach(function (c) { produtos[c.key] = c.val() || {}; });

    const rows = [];

    // ── Vendas de evento ──
    evSnap.forEach(function (ev) {
      const e = ev.val() || {};
      const eventoId = ev.key;
      const eventoNome = e.nome || ('Evento #' + eventoId);
      const vendas = e.vendas || {};
      Object.keys(vendas).forEach(function (k) {
        const v = vendas[k] || {};
        // Vendas canceladas NÃO somem do histórico: vêm marcadas com status 'cancelada'
        // (quem totaliza faturamento — dashboard — é que as ignora).
        const cancelada = v.status === 'cancelada';
        const qtd = Number(v.qtd) || 0;
        const precoUnit = Number(v.precoUnit) || 0;
        const pid = v.produtoId != null ? String(v.produtoId) : null;
        rows.push({
          origem: 'evento',
          status: cancelada ? 'cancelada' : 'ativa',
          data: v.dataHora || null,
          _dt: parseData(v.dataHora),
          produtoId: pid,
          produtoNome: nomeDoProduto(produtos[pid], '#' + pid),
          qtd: qtd,
          precoUnit: precoUnit,
          valorTotal: qtd * precoUnit,
          eventoId: eventoId,
          eventoNome: eventoNome,
          clienteId: v.clienteId || null,
          clienteNome: v.clienteNome || null,
          pagamento: v.pagamento || null,
          referencia: k
        });
      });
    });

    // ── Vendas online (Shopee) ──
    onSnap.forEach(function (c) {
      const v = c.val() || {};
      const qtd = Number(v.qtd) || 0;
      const valorUnit = Number(v.valorUnit) || 0;
      let valorTotal = Number(v.valorTotal);
      if (!valorTotal && valorUnit) valorTotal = valorUnit * qtd;
      valorTotal = valorTotal || 0;
      const precoUnit = valorUnit || (qtd ? valorTotal / qtd : 0);
      const pid = v.produtoId != null ? String(v.produtoId) : null;
      rows.push({
        origem: 'online',
        status: 'ativa',
        data: v.data || null,
        _dt: parseData(v.data),
        produtoId: pid,
        produtoNome: nomeDoProduto(produtos[pid], v.descricaoOriginal || ('#' + (v.produtoId || '?'))),
        qtd: qtd,
        precoUnit: precoUnit,
        valorTotal: valorTotal,
        eventoId: null,
        eventoNome: null,
        clienteId: v.clienteId || null,
        clienteNome: v.clienteNome || null,
        pagamento: v.pagamento || null,
        referencia: v.numeroPedido || c.key
      });
    });

    return rows;
  }

  global.Vendas = {
    carregarConsolidado: carregarConsolidado,
    parseData: parseData,
    diaKey: diaKey
  };
})(window);
