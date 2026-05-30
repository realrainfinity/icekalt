// ICEkalt Service Worker – App-Shell offline cachen.
// Bei jeder Änderung an den App-Dateien CACHE_VERSION erhöhen.
const CACHE_VERSION = 'icekalt-v17';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/balance.js',
  './js/config.js',
  './js/nutrition.js',
  './js/ui.js',
  './js/views/recipes.js',
  './js/views/ingredients.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first für die App-Shell; Netz als Fallback.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((resp) => {
          // Gleiche-Origin GETs nachträglich in den Cache legen.
          if (resp.ok && new URL(request.url).origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
