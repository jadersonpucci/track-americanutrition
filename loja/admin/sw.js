// Painel instalado como app: abre rápido (arquivos do painel em cache, sempre atualizados pela rede)
// e trata o toque nas notificações de pedido.
const CACHE = 'loja-admin-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('/admin/') || u.pathname.endsWith('dados.json')) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => { const w = ws.find((x) => x.url.includes('/admin')); if (w) { w.navigate(url); return w.focus(); } return self.clients.openWindow(url); }));
});
