/* OLC service worker v10 — opens instantly from the device, updates quietly in the background */
const VER = 'olc-v10-2';
const SHELL = ['./', 'index.html', 'style.css', 'merge.js', 'app.js', 'blobs.js', 'v10.js', 'catalog.js', 'journal.js', 'auth.js', 'manifest.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if(r.method !== 'GET') return;
  const u = new URL(r.url);
  if(u.pathname.startsWith('/api/') || (u.origin !== location.origin)) return;     // data always goes to the network
  // stale-while-revalidate: answer from the cache at once, refresh it in the background
  e.respondWith(caches.open(VER).then(async (c) => {
    const hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then(res => { if(res && res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('message', (e) => { if(e.data === 'skip') self.skipWaiting(); });
