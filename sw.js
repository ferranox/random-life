/* sw.js — service worker.
 * Cache-first for static assets, network-first (with cache fallback) for the
 * World Bank API. Uses relative URLs so it works from any deployment path.
 */
var CACHE_NAME = 'random-life-v20';
// ASSET_VERSION: keep in step with the ?v= URLs in index.html / 404.html.
// Bump all three together on any static-asset change so HTML, JS and CSS can
// never mix old and new across browser, edge or service-worker caches.
var ASSET_VERSION = 'v=20';
function v(url) { return url + '?' + ASSET_VERSION; }
var STATIC_ASSETS = [
  './',
  './index.html',
  './404.html',
  './robots.txt',
  './sitemap.xml',
  v('./pico.css'),
  v('./manifest.webmanifest'),
  v('./favicon.ico'),
  v('./icon.svg'),
  v('./js/seed.js'),
  v('./js/names.js'),
  v('./js/data.js'),
  v('./js/generator.js'),
  v('./js/ui.js'),
  v('./js/app.js'),
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // addAll fails entirely if any single asset 404s (e.g. icons not yet
      // generated), so add them individually and ignore failures.
      return Promise.all(STATIC_ASSETS.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== CACHE_NAME;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  if (req.url.indexOf('api.worldbank.org') !== -1) {
    // Network first, fall back to cache.
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // Client-side share routes (/life/v1/<seed>) have no physical file: serve
  // the app shell so JavaScript can render the seeded life. This only helps
  // once the service worker is installed (i.e. return visits); first visits
  // still rely on the server fallback (see dev-server.py / Caddy note).
  // Other navigation misses (genuinely unknown pages) keep the default
  // behaviour below so the server's 404 page still shows.
  if (req.mode === 'navigate' && new URL(req.url).pathname.indexOf('/life/') === 0) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
          return res;
        }
        return caches.match('./index.html');
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  // Cache first for everything else.
  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        // Runtime-cache successful same-origin GETs.
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
    })
  );
});
