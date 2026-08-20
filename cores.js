// ── KOMBINEI — Cores (registro por empresa) ──
// Módulo único e reutilizável:
//   - Registro de cores em /empresas/{id}/cores/{corId} → {nome,hex,dataCriacao}
//   - seed(empresaRef): semeia as cores básicas na primeira vez (idempotente)
//   - montarSeletor({...}): monta o MESMO seletor de cor (chips + "+ Nova cor")
//     usado no cadastro de produto (web/PWA) e em outras telas que precisem de cor.
(function (global) {
    'use strict';

    const BASICAS = [
        { nome: 'Preto', hex: '#000000' },
        { nome: 'Branco', hex: '#FFFFFF' },
        { nome: 'Cinza', hex: '#808080' },
        { nome: 'Vermelho', hex: '#E53935' },
        { nome: 'Azul', hex: '#1E88E5' },
        { nome: 'Verde', hex: '#43A047' },
        { nome: 'Amarelo', hex: '#FDD835' },
        { nome: 'Laranja', hex: '#FB8C00' },
        { nome: 'Roxo', hex: '#8E24AA' },
        { nome: 'Rosa', hex: '#EC407A' },
        { nome: 'Marrom', hex: '#6D4C41' },
        { nome: 'Natural/Transparente', hex: '#E8E4D9' },
    ];

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // Semeia as cores básicas na primeira vez (idempotente: só grava se o nó estiver vazio).
    function seed(empresaRef) {
        return empresaRef('cores').once('value').then(snap => {
            if (snap.exists() && snap.numChildren() > 0) return false;
            const updates = {};
            BASICAS.forEach((c, i) => {
                updates['cores/' + (i + 1)] = { nome: c.nome, hex: c.hex, dataCriacao: new Date().toISOString() };
            });
            updates['contador_cores/proximoId'] = BASICAS.length;
            return empresaRef('').update(updates).then(() => true);
        });
    }

    // Lista o registro de cores da empresa: { id: {nome,hex,dataCriacao} }
    function listar(empresaRef) {
        return empresaRef('cores').once('value').then(snap => {
            const map = {};
            snap.forEach(c => { map[c.key] = c.val() || {}; });
            return map;
        });
    }

    // Cria uma cor nova no registro (mesmo padrão de contador_X/proximoId dos outros cadastros).
    function criar(empresaRef, nome, hex) {
        nome = (nome || '').trim();
        if (!nome) return Promise.reject(new Error('Informe o nome da cor.'));
        return empresaRef('contador_cores/proximoId').transaction(c => (c === null ? 1 : c + 1)).then(res => {
            const id = String(res.snapshot.val());
            const dados = { nome, hex: hex || '#cccccc', dataCriacao: new Date().toISOString() };
            return empresaRef('cores/' + id).set(dados).then(() => ({ corId: id, nome: dados.nome, hex: dados.hex }));
        });
    }

    // Bolinhas de exibição (listagens): recebe array [{nome,hex}] → HTML das bolinhas.
    function renderBolinhas(cores) {
        cores = Array.isArray(cores) ? cores : [];
        if (!cores.length) return '';
        return '<span class="kb-cor-dots">' + cores.map(c =>
            `<span class="kb-cor-dot" style="background:${esc(c.hex || '#ccc')}" title="${esc(c.nome || '')}"></span>`
        ).join('') + '</span>';
    }

    let _cssInjetado = false;
    function injetarCSS() {
        if (_cssInjetado) return;
        _cssInjetado = true;
        const style = document.createElement('style');
        style.id = 'kbCoresCSS';
        style.textContent = `
.kb-cor-seletor { position: relative; }
.kb-cor-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.kb-cor-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; border-radius: 20px;
    background: #eef1f5; border: 1px solid #d0d5dd; font-size: 0.85em; font-weight: 600; color: #444; }
.kb-cor-dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,.2); flex-shrink: 0; }
.kb-cor-x { cursor: pointer; opacity: .6; font-size: 1.1em; line-height: 1; }
.kb-cor-x:hover { opacity: 1; }
.kb-cor-addbtn { background: #f4f7f6; border: 1px dashed #b7c2cc; border-radius: 20px; padding: 5px 12px; font-size: .85em;
    color: #4A93B0; cursor: pointer; font-weight: 600; }
.kb-cor-addbtn:hover { background: #eaf3f7; }
.kb-cor-painel { display: none; position: absolute; z-index: 200; top: 100%; left: 0; margin-top: 4px; background: #fff;
    border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.15); width: 240px; max-height: 280px;
    overflow-y: auto; padding: 6px; }
.kb-cor-painel.open { display: block; }
.kb-cor-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: .9em; }
.kb-cor-item:hover { background: #f5f7f9; }
.kb-cor-item.sel { background: #e3f0f5; }
.kb-cor-novo { border-top: 1px solid #eee; margin-top: 4px; padding-top: 8px; }
.kb-cor-novo-btn { width: 100%; background: none; border: none; text-align: left; padding: 7px 8px; color: #4A93B0;
    font-weight: 600; font-size: .88em; cursor: pointer; border-radius: 6px; }
.kb-cor-novo-btn:hover { background: #f5f7f9; }
.kb-cor-novo-form { padding: 6px 4px 2px; display: none; }
.kb-cor-novo-form.open { display: block; }
.kb-cor-novo-form input[type=text] { width: 100%; padding: 7px 8px; border: 1px solid #ddd; border-radius: 6px; font-size: .88em;
    margin-bottom: 6px; box-sizing: border-box; }
.kb-cor-novo-form .linha { display: flex; gap: 6px; align-items: center; }
.kb-cor-novo-form input[type=color] { width: 38px; height: 34px; padding: 2px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; }
.kb-cor-novo-form button.salvar { flex: 1; background: #28a745; color: #fff; border: none; border-radius: 6px; padding: 8px; font-size: .85em; cursor: pointer; }
.kb-cor-vazio { padding: 8px; color: #999; font-size: .85em; }
.kb-cor-dots { display: inline-flex; gap: 3px; vertical-align: middle; }
.kb-cor-dots .kb-cor-dot { width: 12px; height: 12px; }

html[data-theme="dark"] .kb-cor-chip { background: #33384a !important; border-color: #4a5060 !important; color: #cfd8dc !important; }
html[data-theme="dark"] .kb-cor-addbtn { background: #2a2a3e !important; border-color: #555 !important; color: #7fc1de !important; }
html[data-theme="dark"] .kb-cor-painel { background: #2a2a3e !important; border-color: #555 !important; color: #e0e0e0 !important; }
html[data-theme="dark"] .kb-cor-item:hover { background: #333 !important; }
html[data-theme="dark"] .kb-cor-item.sel { background: #2e4a54 !important; }
html[data-theme="dark"] .kb-cor-novo { border-color: #444 !important; }
html[data-theme="dark"] .kb-cor-novo-btn:hover { background: #333 !important; }
html[data-theme="dark"] .kb-cor-novo-form input[type=text] { background: #1e1e2e !important; color: #e0e0e0 !important; border-color: #555 !important; }
`;
        document.head.appendChild(style);
    }

    function normalizar(lista) {
        if (!Array.isArray(lista)) return [];
        return lista.filter(c => c && c.corId != null).map(c => ({ corId: String(c.corId), nome: c.nome || '', hex: c.hex || '#cccccc' }));
    }

    /* montarSeletor({ container, empresaRef, coresDisponiveis, selecionadas, multi, permitirNovo, onChange })
     *   container:         elemento onde o seletor é montado (fica vazio antes de montar)
     *   empresaRef:        função empresaRef(path) — obrigatória se permitirNovo ou sem coresDisponiveis
     *   coresDisponiveis:  array [{corId,nome,hex}] opcional — restringe as opções (ex.: só as cores do
     *                      produto). Sem isso, carrega (e semeia) o registro inteiro da empresa.
     *   selecionadas:      array [{corId,nome,hex}] — seleção inicial
     *   multi:             true (padrão) permite várias cores; false mantém só uma
     *   permitirNovo:      true (padrão) mostra "+ Adicionar nova cor"
     *   onChange(lista):   chamado a cada mudança na seleção
     * → { getSelecionadas(), destroy() }
     */
    function montarSeletor(opts) {
        opts = opts || {};
        const container = opts.container;
        if (!container) throw new Error('Cores.montarSeletor: container obrigatório.');
        const multi = opts.multi !== false;
        const permitirNovo = opts.permitirNovo !== false;
        const empresaRefFn = opts.empresaRef;

        injetarCSS();

        let selecionadas = normalizar(opts.selecionadas);
        let coresDisp = null; // { id: {nome,hex} }, carregado ao abrir o painel

        container.classList.add('kb-cor-seletor');
        container.innerHTML = '';

        const chipsBox = document.createElement('div'); chipsBox.className = 'kb-cor-chips';
        const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'kb-cor-addbtn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Cor';
        const painel = document.createElement('div'); painel.className = 'kb-cor-painel';

        container.appendChild(chipsBox);
        container.appendChild(addBtn);
        container.appendChild(painel);

        function notificar() { if (typeof opts.onChange === 'function') opts.onChange(selecionadas.slice()); }

        function renderChips() {
            chipsBox.innerHTML = '';
            selecionadas.forEach(c => {
                const chip = document.createElement('span'); chip.className = 'kb-cor-chip';
                chip.innerHTML = `<span class="kb-cor-dot" style="background:${esc(c.hex)}"></span>${esc(c.nome)}`;
                const x = document.createElement('span'); x.className = 'kb-cor-x'; x.textContent = '×'; x.title = 'Remover';
                x.addEventListener('click', (e) => { e.stopPropagation(); remover(c.corId); });
                chip.appendChild(x);
                chipsBox.appendChild(chip);
            });
        }

        function remover(corId) {
            selecionadas = selecionadas.filter(c => c.corId !== corId);
            renderChips(); notificar();
        }

        function selecionar(cor) {
            if (multi) {
                if (!selecionadas.some(c => c.corId === cor.corId)) selecionadas.push(cor);
            } else {
                selecionadas = [cor];
            }
            renderChips(); notificar();
            if (!multi) fecharPainel(); else renderPainel();
        }

        function fontesCores() {
            if (opts.coresDisponiveis) {
                const map = {};
                normalizar(opts.coresDisponiveis).forEach(c => { map[c.corId] = { nome: c.nome, hex: c.hex }; });
                return Promise.resolve(map);
            }
            return seed(empresaRefFn).then(() => listar(empresaRefFn));
        }

        function renderPainel() {
            const itens = Object.keys(coresDisp || {}).map(id => ({ corId: id, nome: coresDisp[id].nome, hex: coresDisp[id].hex }));
            const lista = itens.length
                ? itens.map(c => {
                    const sel = selecionadas.some(s => s.corId === c.corId);
                    return `<div class="kb-cor-item ${sel ? 'sel' : ''}" data-id="${esc(c.corId)}">
                        <span class="kb-cor-dot" style="background:${esc(c.hex)}"></span>${esc(c.nome)}
                        ${sel ? '<i class="fas fa-check" style="margin-left:auto;color:#28a745;"></i>' : ''}
                    </div>`;
                }).join('')
                : '<div class="kb-cor-vazio">Nenhuma cor cadastrada.</div>';

            const novoHtml = permitirNovo ? `
                <div class="kb-cor-novo">
                    <button type="button" class="kb-cor-novo-btn" id="__corNovoBtn"><i class="fas fa-plus"></i> Adicionar nova cor</button>
                    <div class="kb-cor-novo-form" id="__corNovoForm">
                        <input type="text" id="__corNovoNome" placeholder="Nome da cor">
                        <div class="linha">
                            <input type="color" id="__corNovoHex" value="#4A93B0">
                            <button type="button" class="salvar" id="__corNovoSalvar">Salvar</button>
                        </div>
                        <p style="color:#dc3545;font-size:.8em;margin:4px 0 0;min-height:1em;" id="__corNovoErro"></p>
                    </div>
                </div>` : '';

            painel.innerHTML = lista + novoHtml;

            painel.querySelectorAll('.kb-cor-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.dataset.id;
                    selecionar({ corId: id, nome: coresDisp[id].nome, hex: coresDisp[id].hex });
                });
            });

            if (permitirNovo) {
                const btnNovo = painel.querySelector('#__corNovoBtn');
                const form = painel.querySelector('#__corNovoForm');
                btnNovo.addEventListener('click', (e) => { e.stopPropagation(); form.classList.toggle('open'); });
                painel.querySelector('#__corNovoSalvar').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const nome = painel.querySelector('#__corNovoNome').value.trim();
                    const hex = painel.querySelector('#__corNovoHex').value;
                    const erro = painel.querySelector('#__corNovoErro');
                    if (!nome) { erro.textContent = 'Informe o nome da cor.'; return; }
                    if (!empresaRefFn) { erro.textContent = 'Não é possível criar cores aqui.'; return; }
                    erro.textContent = '';
                    try {
                        const nova = await criar(empresaRefFn, nome, hex);
                        coresDisp[nova.corId] = { nome: nova.nome, hex: nova.hex };
                        selecionar(nova);
                    } catch (err) { erro.textContent = 'Erro: ' + err.message; }
                });
            }
        }

        function abrirPainel() {
            fontesCores().then(map => {
                coresDisp = map;
                renderPainel();
                painel.classList.add('open');
            });
        }
        function fecharPainel() { painel.classList.remove('open'); }

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (painel.classList.contains('open')) fecharPainel(); else abrirPainel();
        });
        // Usa composedPath (caminho no momento do clique) em vez de contains(e.target):
        // um clique num item do painel troca o innerHTML na hora (re-render da seleção),
        // o que desconecta o alvo original do DOM antes do evento borbulhar até aqui —
        // container.contains(e.target) daria falso positivo de "clique fora".
        function onOutsideClick(e) {
            const caminho = typeof e.composedPath === 'function' ? e.composedPath() : [];
            if (caminho.indexOf(container) === -1) fecharPainel();
        }
        document.addEventListener('click', onOutsideClick);

        renderChips();

        return {
            getSelecionadas: () => selecionadas.slice(),
            destroy: () => { document.removeEventListener('click', onOutsideClick); container.innerHTML = ''; }
        };
    }

    global.Cores = {
        BASICAS: BASICAS,
        seed: seed,
        listar: listar,
        criar: criar,
        renderBolinhas: renderBolinhas,
        montarSeletor: montarSeletor
    };
})(window);
