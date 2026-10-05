// ── KOMBINEI — Proteção contra perder um cadastro não salvo ──
// Incluir nas telas de cadastro (páginas carregadas no iframe do home.html).
//
// - Marca a página como "com alterações" quando o usuário digita/escolhe algo
//   (só eventos reais do usuário — preenchimentos feitos pelo código não contam).
// - Ao sair da página (gesto/botão de voltar, recarregar, fechar) o navegador pede confirmação.
// - O menu do home.html consulta KombineiSaida.podeSair() antes de trocar de tela e mostra
//   uma confirmação própria (sem a do navegador em seguida).
// - Depois de salvar com sucesso, a página chama KombineiSaida.liberar() antes de redirecionar.
//
// Campos que não são dados do cadastro (busca, filtros) ficam de fora com
// data-sem-aviso no próprio campo ou em um container acima dele.
(function (global) {
    'use strict';

    let sujo = false;
    let liberado = false;
    let guardaNoHistorico = false;

    const MSG = 'Você tem informações não salvas neste cadastro.\n\nSair mesmo assim e perder o que foi digitado?';

    function marcar(e) {
        if (!e.isTrusted || liberado) return;
        const el = e.target;
        if (!el || !el.closest) return;
        if (!el.matches('input, select, textarea, [contenteditable="true"]')) return;
        if (el.type === 'search' || el.closest('[data-sem-aviso]')) return;
        sujo = true;
        // Passo extra no histórico: o gesto/botão "voltar" (touchpad, mouse, celular) cai
        // primeiro aqui (popstate) e a página pergunta antes de sair de verdade.
        if (!guardaNoHistorico) {
            guardaNoHistorico = true;
            try { history.pushState({ kombineiGuarda: true }, ''); } catch (err) {}
        }
    }
    document.addEventListener('input', marcar, true);
    document.addEventListener('change', marcar, true);

    global.addEventListener('popstate', function () {
        if (!guardaNoHistorico) return;
        guardaNoHistorico = false;
        if (sujo && !liberado && !global.confirm(MSG)) {
            // Fica: recoloca o passo extra para o próximo "voltar" perguntar de novo
            guardaNoHistorico = true;
            try { history.pushState({ kombineiGuarda: true }, ''); } catch (err) {}
            return;
        }
        liberado = true;
        history.back();   // segue para a tela anterior de verdade
    });

    global.addEventListener('beforeunload', function (e) {
        if (!sujo || liberado) return;
        e.preventDefault();
        e.returnValue = '';   // Chrome exige returnValue para mostrar o aviso
        return '';
    });

    global.KombineiSaida = {
        MSG,
        temAlteracoes: () => sujo && !liberado,
        // Chama antes de navegar por código; se o usuário confirmar, libera a saída.
        podeSair() {
            if (!sujo || liberado) return true;
            if (!global.confirm(MSG)) return false;
            liberado = true;
            return true;
        },
        // Depois de salvar (ou ao trocar de tela de propósito): não perguntar mais.
        liberar() { liberado = true; sujo = false; },
        // Página que continua aberta após salvar (ex.: cadastro em sequência) volta a vigiar.
        limpar() { sujo = false; liberado = false; },
    };
})(window);
