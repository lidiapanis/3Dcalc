/* KOMBINEI — Service Worker ÚNICO (escopo "/")
 *
 * Controla TODO o domínio (inclusive o PDV slim em /pdv/, que registra este mesmo SW).
 * Estratégia:
 *   - APP SHELL (HTML/CSS/JS/logo/ícones same-origin) → network-first: tenta a rede,
 *     atualiza o cache e devolve; se offline, cai no cache. Garante shell sempre fresco.
 *   - DADOS nunca são cacheados:
 *       • requisições cross-origin (Firebase RTDB/Firestore/Storage, gstatic, CDNs) NÃO
 *         são interceptadas → vão direto à rede.
 *       • mesma-origem em /api/** (endpoints do Cloud Functions) → sempre rede, sem cache.
 *   - Só GET é cacheado; POST/PUT/etc. passam direto.
 */
const CACHE = 'kombinei-app-v11';

// Núcleo do shell pré-cacheado (resiliente: um 404 não quebra a instalação).
const SHELL = [
  '/', '/login.html', '/home.html', '/manifest.json',
  '/kombinei-logo.svg', '/icon-192.png', '/icon-512.png', '/pdv/icon-maskable-512.png',
  '/dark-mode.css', '/theme.js', '/empresa.js',
  '/config.js', '/tags.js', '/cores.js', '/barcode.js', '/pwa.js', '/cliente-pdv.js', '/vendas.js', '/estoque.js',
  '/dashboard.html', '/historico_vendas.html',
  '/listagem_orcamentos.html', '/cadastro_orcamentos.html',
  '/listagem_pessoas.html', '/cadastro_pessoas.html',
  '/listagem_produtos.html', '/cadastro_produtos.html',
  '/listagem_insumos.html', '/cadastro_insumos.html',
  '/listagem_eventos.html', '/cadastro_eventos.html',
  '/configuracoes.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // escrita/dados → rede

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // Firebase/CDNs → rede, sem cache
  if (url.pathname.startsWith('/api/')) return;     // endpoints de dados → sempre rede

  // App shell same-origin → network-first (fresco quando online, cache quando offline)
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/home.html')))
  );
});
