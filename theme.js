// Aplica o tema imediatamente ao carregar
(function () {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();

// Escuta mensagem do frame pai (home.html) e aplica o tema em tempo real
window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'SET_THEME') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
        localStorage.setItem('theme', e.data.theme);
    }
});
