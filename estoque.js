/* KOMBINEI — Motor de Estoque / precificação de filamento — módulo compartilhado
 *
 * Centraliza a regra do "Módulo de Estoque" para reuso entre as telas (web + PWA):
 *   - precoRoloMedio(insumos): preço do rolo (R$/kg) derivado da MÉDIA dos insumos
 *     tipo 'filamento' (custoUnitario = R$/g). Substitui o precoRolo manual do produto.
 *   - planejarProducao(...): dado um produto + X peças, calcula o consumo de insumos
 *     (material × qtd), filamento (pesoPeca × X g da cor escolhida) e subprodutos
 *     (estoque pronto × qtd, em cascata), valida disponibilidade e devolve um plano.
 *
 * Sem dependências de Firebase aqui — recebe os dados já lidos (mapas em memória),
 * para ser puro e testável. As telas fazem a leitura/escrita via empresaRef.
 */
(function (global) {
  'use strict';

  function num(x) { const n = Number(x); return isNaN(n) ? 0 : n; }

  // Tipos de filamento conhecidos (fonte única dos dropdowns de Insumos/Produto).
  const TIPOS_FILAMENTO = ['PLA', 'PLA Silk', 'PETG', 'ABS', 'ASA'];

  // Lista os insumos tipo 'filamento' a partir de um array OU mapa {id:insumo}.
  function filamentos(insumos) {
    const arr = Array.isArray(insumos) ? insumos : Object.keys(insumos || {}).map(k => insumos[k]);
    return arr.filter(i => i && i.tipo === 'filamento');
  }

  // Preço de venda do filamento (R$/g): usa o precoUnitario; se ausente (filamento
  // legado), cai no custoUnitario — mantém o preço dos produtos antigos inalterado.
  function precoDoFilamento(i) {
    return num(i.precoUnitario != null ? i.precoUnitario : i.custoUnitario);
  }

  /* precoRoloMedio(insumos, tipoFilamento?) → Number(R$/kg) | null
   * Média do PREÇO (R$/g) dos filamentos × 1000. Se tipoFilamento for informado,
   * a média considera SOMENTE os filamentos desse tipo (PLA, PETG, ...). Sem o 2º
   * argumento, a média é geral (compat. com chamadas antigas). null se não houver
   * filamento (com preço > 0) → o chamador aplica o fallback (precoRolo manual). */
  function precoRoloMedio(insumos, tipoFilamento) {
    let fil = filamentos(insumos);
    if (tipoFilamento) fil = fil.filter(i => (i.tipoFilamento || '') === tipoFilamento);
    fil = fil.filter(i => precoDoFilamento(i) > 0);
    if (!fil.length) return null;
    const media = fil.reduce((s, i) => s + precoDoFilamento(i), 0) / fil.length;
    return media * 1000;
  }

  /* planejarProducao({ produto, qtd, filamentoId, produtosMap, insumosMap })
   *   produto:     { pesoPeca, receita:[{insumoId,quantidade}], subprodutos:[{produtoId,quantidade}] }
   *   produtosMap: { id: { nome, estoque, custoTotal, ... } }  (subprodutos)
   *   insumosMap:  { id: { nome, tipo, unidade, estoqueAtual, custoUnitario, cor } }
   * → {
   *     itens: [{ kind:'insumo'|'filamento'|'subproduto', id, nome, necessario, disponivel, unidade, falta }],
   *     custoEstimado, ok(boolean), faltantes:[...itens com falta>0]
   *   }
   */
  function planejarProducao(opts) {
    opts = opts || {};
    const produto = opts.produto || {};
    const X = num(opts.qtd);
    const insumosMap = opts.insumosMap || {};
    const produtosMap = opts.produtosMap || {};
    const itens = [];
    let custo = 0;

    // 1) Insumos da receita (material): consumo = quantidade × X
    (produto.receita || []).forEach(r => {
      const ins = insumosMap[r.insumoId] || {};
      const necessario = num(r.quantidade) * X;
      const disponivel = num(ins.estoqueAtual);
      custo += num(ins.custoUnitario) * necessario;
      itens.push({
        kind: 'insumo', id: String(r.insumoId), nome: ins.nome || ('#' + r.insumoId),
        necessario, disponivel, unidade: ins.unidade || 'un', falta: Math.max(0, necessario - disponivel)
      });
    });

    // 2) Filamento escolhido (cor): consumo = pesoPeca × X gramas
    if (opts.filamentoId != null && opts.filamentoId !== '') {
      const fil = insumosMap[opts.filamentoId] || {};
      const necessario = num(produto.pesoPeca) * X;
      const disponivel = num(fil.estoqueAtual);
      custo += num(fil.custoUnitario) * necessario;
      const corNome = fil.cor && fil.cor.nome ? ' (' + fil.cor.nome + ')' : '';
      itens.push({
        // Filamento é sempre contabilizado em GRAMA internamente (mesmo que o cadastro use KG),
        // e o consumo aqui é pesoPeca×X gramas → rótulo fixo 'g' (não usar fil.unidade).
        kind: 'filamento', id: String(opts.filamentoId), nome: (fil.nome || ('#' + opts.filamentoId)) + corNome,
        necessario, disponivel, unidade: 'g', falta: Math.max(0, necessario - disponivel)
      });
    }

    // 3) Subprodutos: baixa de estoque PRONTO (cascata), consumo = quantidade × X
    (produto.subprodutos || []).forEach(s => {
      const sub = produtosMap[s.produtoId] || {};
      const necessario = num(s.quantidade) * X;
      const disponivel = num(sub.estoque);
      custo += num(sub.custoTotal) * necessario;
      itens.push({
        kind: 'subproduto', id: String(s.produtoId), nome: sub.nome || ('#' + s.produtoId),
        necessario, disponivel, unidade: 'un', falta: Math.max(0, necessario - disponivel)
      });
    });

    const faltantes = itens.filter(i => i.falta > 0);
    return { itens, custoEstimado: custo, ok: X > 0 && faltantes.length === 0, faltantes };
  }

  global.Estoque = {
    num: num,
    TIPOS_FILAMENTO: TIPOS_FILAMENTO,
    filamentos: filamentos,
    precoDoFilamento: precoDoFilamento,
    precoRoloMedio: precoRoloMedio,
    planejarProducao: planejarProducao
  };
})(window);
