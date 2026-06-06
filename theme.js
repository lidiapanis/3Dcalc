// Aplica o tema salvo ao carregar a página
(function () {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();

// Escuta mensagens do frame pai (home.html) para sincronizar o tema em tempo real
window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'SET_THEME') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
        localStorage.setItem('theme', e.data.theme);
    }
});
