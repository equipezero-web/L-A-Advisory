const CACHE_NAME = 'la-royal-advisory-v8';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

// Instala o Service Worker e salva o núcleo da aplicação.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Remove versões antigas do cache ao publicar uma atualização.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName !== CACHE_NAME)
                        .map(cacheName => caches.delete(cacheName))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Estratégia:
// - Navegação: tenta a rede e usa o cache se estiver offline.
// - Arquivos estáticos: usa cache primeiro e atualiza em segundo plano.
// - APIs externas: tenta a rede primeiro.
self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => cache.put('./index.html', responseClone));

                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );

        return;
    }

    const requestUrl = new URL(request.url);

    if (requestUrl.origin !== self.location.origin) {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match(request))
        );

        return;
    }

    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                const networkFetch = fetch(request)
                    .then(networkResponse => {
                        if (
                            networkResponse &&
                            networkResponse.status === 200 &&
                            networkResponse.type === 'basic'
                        ) {
                            const responseClone = networkResponse.clone();

                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(request, responseClone));
                        }

                        return networkResponse;
                    })
                    .catch(() => cachedResponse);

                return cachedResponse || networkFetch;
            })
    );
});

// Permite ativar uma nova versão imediatamente quando solicitado pelo site.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
