// service-worker.js
const CACHE_NAME = 'gre-vocab-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './words.json',
  './manifest.json',
  './icon1.png',
  './icon2.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
