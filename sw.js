/* sw.js — service worker.
 * Cache-first for static assets, network-first (with cache fallback) for the
 * World Bank API. Uses relative URLs so it works from any deployment path.
 */
var CACHE_NAME = 'random-life-v10';
var STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './favicon.ico',
  './js/theme.js',
  './js/names.js',
  './js/data.js',
  './js/generator.js',
  './js/ui.js',
  './js/app.js',
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
