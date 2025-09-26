const CACHE_NAME = "vocab-cache-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/words.json",
  "/icon.png",
  "/splash.png"
];

// Install event - cache files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Fetch event - serve from cache first
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
