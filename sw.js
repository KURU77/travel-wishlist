/* Service Worker — ホーム画面に追加してオフラインでも開けるようにする */
const VERSION = 'v1';
const SHELL_CACHE = `travel-wishlist-shell-${VERSION}`;
const TILE_CACHE = `travel-wishlist-tiles-${VERSION}`;
const TILE_LIMIT = 400;

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/presets.js',
  './js/vendor/leaflet.js',
  './js/vendor/leaflet.css',
  './js/vendor/images/marker-icon.png',
  './js/vendor/images/marker-icon-2x.png',
  './js/vendor/images/marker-shadow.png',
  './js/vendor/images/layers.png',
  './js/vendor/images/layers-2x.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 検索API はキャッシュしない（常に最新を取りに行く）
  if (url.hostname.endsWith('nominatim.openstreetmap.org')) return;

  // 地図タイルはキャッシュ優先。一度見た範囲はオフラインでも表示できる
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          trimCache(TILE_CACHE, TILE_LIMIT);
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 自分のファイルはキャッシュ優先＋バックグラウンドで更新
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    if (hit) {
      event.waitUntil(network);
      return hit;
    }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
