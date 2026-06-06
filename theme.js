// Lê o tema: prioriza URL param (?theme=dark), depois localStorage
(function () {
    var params = new URLSearchParams(window.location.search);
    var theme = params.get('theme') || localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (params.get('theme')) {
        localStorage.setItem('theme', theme);
    }
})();

// Também escuta postMessage do pai como fallback
window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'SET_THEME') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
        localStorage.setItem('theme', e.data.theme);
    }
});
