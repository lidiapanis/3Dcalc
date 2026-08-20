/* KOMBINEI PDV — SW DESCONTINUADO.
 * O app agora usa UM service worker único na raiz (/sw.js, escopo "/").
 * Este stub se auto-desregistra para limpar instalações antigas do /pdv/sw.js
 * e evitar dois service workers concorrentes. Não cacheia nada.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => { try { c.navigate(c.url); } catch (_) {} }))
      .catch(() => {})
  );
});
