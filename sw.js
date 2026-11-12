const CACHE_NAME = "la-royal-advisory-v52";

const urlsToCache = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icons/icons-192.png",
    "./icons/icons-512.png",
    "./icons/maskable-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        })
    );

    self.clients.claim();
});

// Only cache the public application shell. Customer/API data must never be stored here.
self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(async () => {
                const cache = await caches.open(CACHE_NAME);
                return await cache.match("./index.html") ||
                    Response.error();
            })
        );
        return;
    }

    const shellUrls = new Set(urlsToCache.map(item => new URL(item, self.registration.scope).pathname));
    if (!shellUrls.has(url.pathname)) return;
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});

self.addEventListener("message", event => {
    // Only a same-origin controlled page may request a worker lifecycle change.
    const source = event.source;
    if (!source || !source.url) return;
    try {
        const clientUrl = new URL(source.url);
        if (clientUrl.origin !== self.location.origin) return;
    } catch {
        return;
    }
    if (
        event.data === "SKIP_WAITING" ||
        event.data?.tipo === "ATUALIZAR_AGORA"
    ) {
        event.waitUntil(self.skipWaiting());
    }
});
