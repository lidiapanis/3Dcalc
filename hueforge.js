// ── KOMBINEI — HueForge (catálogo + correlação de cores) ──
// Módulo único e reutilizável (mesmo padrão de cores.js/tags.js):
//   - PALETA canônica + normalizarCor/normalizarLista (sinônimos de marca → cor simplificada)
//   - correlacionar(coresNecessarias, coresCarregadas) → status de "imprimível agora"
//   - sugerirMelhorCombo(hueforges, tamanho) → combinação de cores que desbloqueia mais itens
//   - montarSeletorCores({...}) → chips de seleção (sem hex, sem "+ Nova cor" — paleta é fixa)
(function (global) {
    'use strict';

    const PALETA = [
        'Amarelo', 'Amarelo claro', 'Azul', 'Bege', 'Branco', 'Ciano', 'Cinza', 'Cinza claro',
        'Cinza escuro', 'Dourado', 'Laranja', 'Magenta', 'Marrom', 'Preto', 'Rosa', 'Roxo',
        'Turquesa', 'Verde', 'Verde escuro', 'Vermelho'
    ];

    // Sinônimos de marca (BambuLab e afins) → cor canônica. Ordem importa: termos
    // compostos (ex.: "dark gray", "blue gray") vêm antes dos genéricos (ex.: "gray").
    const SINONIMOS = [
        [/jade\s*white|cold\s*white|matte\s*white|blanco|\bwhite\b/i, 'Branco'],
        [/charcoal|pearl\s*black|matte\s*black|\bblack\b/i, 'Preto'],
        [/dark\s*gr[ae]y/i, 'Cinza escuro'],
        [/light\s*gr[ae]y/i, 'Cinza claro'],
        [/blue\s*gr[ae]y|space\s*gr[ae]y|\bsilver\b|\bgr[ae]y\b/i, 'Cinza'],
        [/pumpkin\s*orange|\borange\b/i, 'Laranja'],
        [/scarlet\s*red|true\s*red|\bred\b/i, 'Vermelho'],
        [/sunflower\s*yellow|\byellow\b/i, 'Amarelo'],
        [/purple\s*ice|\bpurple\b/i, 'Roxo'],
        [/\bmagenta\b/i, 'Magenta'],
        [/\bcyan\b/i, 'Ciano'],
        [/\bturquoise\b/i, 'Turquesa'],
        [/dark\s*green/i, 'Verde escuro'],
        [/\bgreen\b/i, 'Verde'],
        [/metallic\s*gold|silk\s*gold|\bgold\b/i, 'Dourado'],
        [/\bbrown\b/i, 'Marrom'],
        [/hot\s*pink|\bpink\b/i, 'Rosa'],
        [/\bbeige\b/i, 'Bege'],
        [/\bblue\b/i, 'Azul'],
    ];

    function limpar(s) { return String(s == null ? '' : s).trim(); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // Normaliza um único nome de cor de origem (ex.: "BambuLab Basic Pumpkin Orange") p/
    // a cor canônica em português. Se já for uma cor da paleta (case-insensitive), retorna
    // ela na grafia oficial. Sem correspondência → retorna o texto original (trim), pra
    // não perder a informação — o usuário ajusta manualmente antes de salvar.
    function normalizarCor(nomeOrigem) {
        const texto = limpar(nomeOrigem);
        if (!texto) return '';
        const direta = PALETA.find(c => c.toLowerCase() === texto.toLowerCase());
        if (direta) return direta;
        for (const [re, canonica] of SINONIMOS) {
            if (re.test(texto)) return canonica;
        }
        return texto;
    }

    // Normaliza uma lista de nomes (string única separada por , ; | ou array) → array
    // de cores canônicas, sem duplicatas, na ordem de primeira ocorrência.
    function normalizarLista(entrada) {
        const itens = Array.isArray(entrada) ? entrada : limpar(entrada).split(/[,;|\/]/);
        const vistas = new Set();
        const resultado = [];
        itens.map(limpar).filter(Boolean).forEach(item => {
            const c = normalizarCor(item);
            if (c && !vistas.has(c)) { vistas.add(c); resultado.push(c); }
        });
        return resultado;
    }

    // Varre um texto livre (título+descrição de uma página de HueForge) procurando
    // qualquer sinônimo conhecido e retorna as cores canônicas distintas encontradas.
    function detectarCoresEmTexto(texto) {
        texto = limpar(texto);
        if (!texto) return [];
        const achadas = [];
        const vistas = new Set();
        SINONIMOS.forEach(([re, canonica]) => {
            const global_re = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
            if (global_re.test(texto) && !vistas.has(canonica)) { vistas.add(canonica); achadas.push(canonica); }
        });
        return achadas;
    }

    /* correlacionar(coresNecessarias, coresCarregadas)
     *   coresNecessarias: array de cores distintas que o HueForge precisa
     *   coresCarregadas:  array (até 4) das cores carregadas agora na impressora
     * → { status: 'imprimivel'|'falta1'|'faltamN'|'impossivel', faltando: string[], podeImprimir }
     *   'impossivel' = precisa de mais de 4 cores distintas → nunca cabe nos 4 slots.
     */
    function correlacionar(coresNecessarias, coresCarregadas) {
        const necessarias = [...new Set((coresNecessarias || []).filter(Boolean))];
        if (necessarias.length > 4) {
            return { status: 'impossivel', faltando: [], podeImprimir: false };
        }
        const carregadasSet = new Set((coresCarregadas || []).filter(Boolean));
        const faltando = necessarias.filter(c => !carregadasSet.has(c));
        const status = faltando.length === 0 ? 'imprimivel' : (faltando.length === 1 ? 'falta1' : 'faltamN');
        return { status, faltando, podeImprimir: faltando.length === 0 };
    }

    // Sugestão gulosa: a cada uma das 4 posições, escolhe a cor (dentre as usadas pelos
    // HueForges com <=4 cores) que maximiza o nº de itens totalmente cobertos pela
    // combinação parcial + essa cor. Não é ótimo global, mas é rápido e dá um bom ponto
    // de partida (o usuário pode ajustar manualmente os 4 seletores depois).
    function sugerirMelhorCombo(hueforges, tamanho) {
        tamanho = tamanho || 4;
        const elegiveis = (hueforges || []).filter(h => new Set(h.cores || []).size <= tamanho);
        let combo = [];
        for (let i = 0; i < tamanho; i++) {
            const candidatos = new Set();
            elegiveis.forEach(h => (h.cores || []).forEach(c => { if (combo.indexOf(c) === -1) candidatos.add(c); }));
            if (!candidatos.size) break;
            let melhor = null, melhorScore = -1;
            candidatos.forEach(c => {
                const teste = combo.concat([c]);
                const score = elegiveis.filter(h => (h.cores || []).every(cc => teste.indexOf(cc) !== -1)).length;
                if (score > melhorScore) { melhorScore = score; melhor = c; }
            });
            if (melhor == null) break;
            combo.push(melhor);
        }
        const desbloqueados = elegiveis.filter(h => (h.cores || []).every(cc => combo.indexOf(cc) !== -1)).length;
        return { combo, desbloqueados };
    }

    let _cssInjetado = false;
    function injetarCSS() {
        if (_cssInjetado) return;
        _cssInjetado = true;
        const style = document.createElement('style');
        style.id = 'kbHueforgeCSS';
        style.textContent = `
.hf-cor-seletor { position: relative; }
.hf-cor-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.hf-cor-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 10px; border-radius: 20px;
    background: #eef1f5; border: 1px solid #d0d5dd; font-size: 0.85em; font-weight: 600; color: #444; }
.hf-cor-x { cursor: pointer; opacity: .6; font-size: 1.1em; line-height: 1; }
.hf-cor-x:hover { opacity: 1; }
.hf-cor-addbtn { background: #f4f7f6; border: 1px dashed #b7c2cc; border-radius: 20px; padding: 5px 12px; font-size: .85em;
    color: #4A93B0; cursor: pointer; font-weight: 600; }
.hf-cor-addbtn:hover { background: #eaf3f7; }
.hf-cor-painel { display: none; position: absolute; z-index: 200; top: 100%; left: 0; margin-top: 4px; background: #fff;
    border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.15); width: 220px; max-height: 260px;
    overflow-y: auto; padding: 6px; }
.hf-cor-painel.open { display: block; }
.hf-cor-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: .9em; }
.hf-cor-item:hover { background: #f5f7f9; }
.hf-cor-item.sel { background: #e3f0f5; }
html[data-theme="dark"] .hf-cor-chip { background: #33384a !important; border-color: #4a5060 !important; color: #cfd8dc !important; }
html[data-theme="dark"] .hf-cor-addbtn { background: #2a2a3e !important; border-color: #555 !important; color: #7fc1de !important; }
html[data-theme="dark"] .hf-cor-painel { background: #2a2a3e !important; border-color: #555 !important; color: #e0e0e0 !important; }
html[data-theme="dark"] .hf-cor-item:hover { background: #333 !important; }
html[data-theme="dark"] .hf-cor-item.sel { background: #2e4a54 !important; }
`;
        document.head.appendChild(style);
    }

    /* montarSeletorCores({ container, selecionadas, multi, onChange })
     *   Seletor de chips sobre a PALETA fixa (sem hex, sem criar cor nova).
     *   selecionadas: array de nomes canônicos (seleção inicial)
     *   multi: true (padrão) permite várias cores; false mantém só uma
     * → { getSelecionadas(), setSelecionadas(lista), destroy() }
     */
    function montarSeletorCores(opts) {
        opts = opts || {};
        const container = opts.container;
        if (!container) throw new Error('Hueforge.montarSeletorCores: container obrigatório.');
        const multi = opts.multi !== false;

        injetarCSS();

        let selecionadas = normalizarLista(opts.selecionadas || []);

        container.classList.add('hf-cor-seletor');
        container.innerHTML = '';

        const chipsBox = document.createElement('div'); chipsBox.className = 'hf-cor-chips';
        const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'hf-cor-addbtn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Cor';
        const painel = document.createElement('div'); painel.className = 'hf-cor-painel';

        container.appendChild(chipsBox);
        container.appendChild(addBtn);
        container.appendChild(painel);

        function notificar() { if (typeof opts.onChange === 'function') opts.onChange(selecionadas.slice()); }

        function renderChips() {
            chipsBox.innerHTML = '';
            selecionadas.forEach(nome => {
                const chip = document.createElement('span'); chip.className = 'hf-cor-chip';
                chip.appendChild(document.createTextNode(nome));
                const x = document.createElement('span'); x.className = 'hf-cor-x'; x.textContent = '×'; x.title = 'Remover';
                x.addEventListener('click', (e) => { e.stopPropagation(); remover(nome); });
                chip.appendChild(x);
                chipsBox.appendChild(chip);
            });
        }

        function remover(nome) {
            selecionadas = selecionadas.filter(c => c !== nome);
            renderChips(); notificar();
        }

        function selecionar(nome) {
            if (multi) {
                if (selecionadas.indexOf(nome) === -1) selecionadas.push(nome);
            } else {
                selecionadas = [nome];
            }
            renderChips(); notificar();
            if (!multi) fecharPainel(); else renderPainel();
        }

        function renderPainel() {
            painel.innerHTML = PALETA.map(nome => {
                const sel = selecionadas.indexOf(nome) !== -1;
                return `<div class="hf-cor-item ${sel ? 'sel' : ''}" data-nome="${esc(nome)}">
                    ${esc(nome)}${sel ? '<i class="fas fa-check" style="margin-left:auto;color:#28a745;"></i>' : ''}
                </div>`;
            }).join('');
            painel.querySelectorAll('.hf-cor-item').forEach(el => {
                el.addEventListener('click', () => selecionar(el.dataset.nome));
            });
        }

        function abrirPainel() { renderPainel(); painel.classList.add('open'); }
        function fecharPainel() { painel.classList.remove('open'); }

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (painel.classList.contains('open')) fecharPainel(); else abrirPainel();
        });
        function onOutsideClick(e) {
            const caminho = typeof e.composedPath === 'function' ? e.composedPath() : [];
            if (caminho.indexOf(container) === -1) fecharPainel();
        }
        document.addEventListener('click', onOutsideClick);

        renderChips();

        return {
            getSelecionadas: () => selecionadas.slice(),
            setSelecionadas: (lista) => { selecionadas = normalizarLista(lista || []); renderChips(); },
            destroy: () => { document.removeEventListener('click', onOutsideClick); container.innerHTML = ''; }
        };
    }

    global.Hueforge = {
        PALETA,
        normalizarCor,
        normalizarLista,
        detectarCoresEmTexto,
        correlacionar,
        sugerirMelhorCombo,
        montarSeletorCores
    };
})(window);
