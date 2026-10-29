// Service worker: az iroda „héját” (HTML, CSS, JS, ikonok) tárolja, hogy a program gyorsan induljon, és kapcsolat nélkül is
// megnyíljon. AZ ADATOKAT (/api/...) SOHA nem tárolja el: a jelentések és dokumentumok bizalmasak, mindig a szerverről jönnek.
const VERSION = '__VERSION__';
const CACHE = `iroda-${VERSION}`;
const SHELL = ['/', '/app.js', '/app.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('iroda-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // az API-t a böngésző intézi
  // Hálózat először (így a frissítés azonnal megjelenik), kapcsolat nélkül a tárolt héj.
  e.respondWith(fetch(req).then(res => {
    if (res.ok && SHELL.includes(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
