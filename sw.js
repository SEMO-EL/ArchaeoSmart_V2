/* ArchaeoSmart v2.0.0 — Service Worker */

const CACHE = "archaeosmart-v2.0.0";

const PRECACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://unpkg.com/html5-qrcode",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js"
];

/* Install: pre-cache all assets */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cache each individually so one failure doesn't block the rest
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn("SW: could not cache", url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* Activate: delete old caches */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: cache-first for app assets, network-first for tiles */
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Map tiles — always network, fallback to cache
  if (url.includes("tile.openstreetmap.org")) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200 || res.type === "opaque") return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      });
    })
  );
});
