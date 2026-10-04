// ── KOMBINEI — Máquinas (impressoras) da empresa ──
// Registro em /empresas/{id}/maquinas/{maquinaId} →
//   { apelido, marca, modelo, tipo, numeroSerie, consumoW, vidaUtilHoras, custoManutencao,
//     valorCompra, dataAquisicao, notaFiscal, fornecedorId, fornecedorNome,
//     padrao, ativa, observacoes, dataCriacao, dataAtualizacao }
//
// Fonte única das regras de custo por máquina, usada no cadastro de máquinas (Configurações),
// no cadastro de produto (web + PDV) e no Cálculo Rápido:
//   - desgaste por hora  = valorCompra / vidaUtilHoras
//   - outros custos/peça = custoManutencao (bico etc., por impressão) + horas × desgaste/h
//   - consumo (W)        = consumoW × fator do material (+20% p/ mesa quente: PETG/ABS/ASA)
(function (global) {
    'use strict';

    const PADROES = { consumoW: 80, vidaUtilHoras: 5000, custoManutencao: 1.00 };
    const MATERIAIS_QUENTES = ['PETG', 'ABS', 'ASA'];
    const TIPOS = ['FDM (filamento)', 'Resina', 'Laser', 'Outra'];

    function num(x) { const n = Number(x); return isNaN(n) ? 0 : n; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // { id: maquina } da empresa
    function carregar(empresaRef) {
        return empresaRef('maquinas').once('value').then(snap => {
            const mapa = {};
            if (snap.exists()) snap.forEach(c => { mapa[c.key] = c.val() || {}; });
            return mapa;
        });
    }

    // Máquina padrão (ativa) ou, se houver só uma ativa, ela. null se não houver.
    function padrao(mapa) {
        const ativas = Object.keys(mapa || {}).filter(id => mapa[id].ativa !== false);
        const p = ativas.find(id => mapa[id].padrao);
        if (p) return p;
        return ativas.length === 1 ? ativas[0] : null;
    }

    function fatorMaterial(tipoFilamento) {
        return MATERIAIS_QUENTES.includes(String(tipoFilamento || '')) ? 1.2 : 1;
    }

    function desgastePorHora(m) {
        const vida = num(m && m.vidaUtilHoras);
        return vida > 0 ? num(m.valorCompra) / vida : 0;
    }

    // Custos de UMA impressão de `horas` nesta máquina
    function custos(m, horas, tipoFilamento) {
        const h = num(horas);
        const desgasteHora = desgastePorHora(m);
        const manutencao = num(m && m.custoManutencao);
        const desgaste = h * desgasteHora;
        return {
            watts: Math.round(num(m && m.consumoW) * fatorMaterial(tipoFilamento)),
            manutencao,
            desgasteHora,
            desgaste,
            outros: manutencao + desgaste,
        };
    }

    function nomeExibicao(m) {
        const det = [m.marca, m.modelo].filter(Boolean).join(' ');
        return (m.apelido || 'Máquina') + (det ? ' (' + det + ')' : '');
    }

    // <option>s: ativas + a selecionada (mesmo inativa, p/ produtos antigos)
    function opcoes(mapa, selecionada, rotuloVazio) {
        let html = '<option value="">' + esc(rotuloVazio || '— sem máquina (informar manualmente) —') + '</option>';
        Object.keys(mapa || {})
            .filter(id => mapa[id].ativa !== false || id === String(selecionada))
            .sort((a, b) => String(mapa[a].apelido || '').localeCompare(String(mapa[b].apelido || '')))
            .forEach(id => {
                const m = mapa[id];
                html += '<option value="' + esc(id) + '"' + (id === String(selecionada) ? ' selected' : '') + '>'
                    + esc(nomeExibicao(m)) + (m.ativa === false ? ' — inativa' : '') + '</option>';
            });
        return html;
    }

    // Recalcula os campos de custo de um produto salvo que usa a máquina `m`
    // (usado ao alterar a máquina). Não mexe no precoVenda escolhido pelo usuário.
    function recalcularProduto(produto, m) {
        const p = produto || {};
        if (p.modoCusto === 'sem') return null;
        const c = custos(m, p.tempoImpressao, p.tipoFilamento);
        const custoEnergia = (c.watts / 1000) * num(p.tempoImpressao) * num(p.taxaKWh);
        const custoTotal = num(p.custoMaterial) + custoEnergia + c.outros;
        return {
            consumoImpressora: c.watts,
            custoEnergia,
            custoOutros: c.outros,
            custoTotal,
            precoVendaSugerido: custoTotal * (1 + num(p.margemLucro) / 100),
            maquinaNome: m.apelido || '',
        };
    }

    global.Maquinas = {
        PADROES, TIPOS, MATERIAIS_QUENTES,
        carregar, padrao, fatorMaterial, desgastePorHora, custos, nomeExibicao, opcoes, recalcularProduto,
    };
})(window);
