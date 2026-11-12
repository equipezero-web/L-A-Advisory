const CACHE_NAME = "la-royal-advisory-v51";

const urlsToCache = [
    "./",
    "./index.html",
    "./manifest.json"
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

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if (
                    response &&
                    response.status === 200 &&
                    response.type === "basic"
                ) {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                }

                return response;
            })
            .catch(() => {
                return caches.match(request).then(cachedResponse => {
                    return cachedResponse || caches.match("./index.html");
                });
            })
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
