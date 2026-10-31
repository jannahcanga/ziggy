const CACHE = 'ziggy-v10';
const TILES = 'ziggy-tiles';
const SHELL = ['./', './index.html', './styles.css', './app.js', './cat.js', './book.js', './countries.js', './backend.js', './config.js', './manifest.webmanifest', './icons/icon-192.png', './brand/tulip-chalk-transparent.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  // only old app copies are cleared; the book and saved map tiles stay
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ziggy-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Map tiles: keep the ones you've looked at, so the map still shows on bad data abroad.
  if (/(^|\.)tile\.openstreetmap\.(org|fr)$/.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) { c.put(e.request, r.clone()); if (++added % 50 === 0) trim(c); }
      return r;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // App files: network first so updates show up, cache as fallback for offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
let trimming = false, added = 0;
async function trim(c) { // keep roughly the last 1500 tiles (about 30 MB)
  if (trimming) return; trimming = true;
  try { const ks = await c.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - 1500))) await c.delete(k); } finally { trimming = false; }
}
