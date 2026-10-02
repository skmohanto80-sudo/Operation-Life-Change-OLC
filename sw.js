// OLC service worker v9
//  - app shell (html/css/js): network first with a short timeout, so you always get the newest version
//    when online but the app still opens instantly from cache when offline / on slow networks
//  - images & fonts: cache first (fast, and they keep showing even if the connection drops)
//  - the backend API is never cached
const VERSION = 'olc-v9';
const SHELL = ['./', './index.html', './style.css', './app.js', './auth.js', './manifest.json'];
const CORE_ASSETS = ['assets/logo_symbol.png', 'assets/logo_text.png', 'assets/profile.png', 'assets/id_front.jpg', 'assets/id_back.jpg', 'assets/radha_krishna.jpg', 'assets/icon-192.png', 'assets/icon-512.png']
  .concat(['agent','lance_naik','naik','sergent','cadet','lieutenant','captain','major','colonel','brigedier','commander','jawan','general','field_marshal'].map(k => 'assets/ranks/' + k + '.png'));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.concat(CORE_ASSETS).map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const isImage = (u) => /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(u.pathname);
const isFont = (u) => u.hostname === 'fonts.gstatic.com' || u.hostname === 'fonts.googleapis.com';

async function putIfGood(cache, req, res){ try{ if(res && res.ok && res.status === 200) await cache.put(req, res.clone()); }catch(e){} }

function networkFirst(req, ms){
  return caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(async (res) => { await putIfGood(cache, req, res); return res; });
    if(!cached) return net;
    return Promise.race([net.catch(() => cached), new Promise(r => setTimeout(() => r(cached), ms))]);
  });
}
function cacheFirst(req){
  return caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    if(hit) return hit;
    const res = await fetch(req);
    await putIfGood(cache, req, res);
    return res;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.pathname.startsWith('/api/') || url.hostname.endsWith('onrender.com')) return;   // never touch the backend
  if(url.origin === location.origin && isImage(url)) { event.respondWith(cacheFirst(req).catch(() => fetch(req))); return; }
  if(isFont(url)) { event.respondWith(cacheFirst(req).catch(() => fetch(req))); return; }
  if(url.origin === location.origin) { event.respondWith(networkFirst(req, 2500).catch(() => caches.match(req, { ignoreSearch: true }))); }
});
