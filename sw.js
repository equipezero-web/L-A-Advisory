const CACHE_NAME = 'la-advisory-v3'; // Versão incrementada para forçar atualização em todos os aparelhos

// Arquivos essenciais estáticos
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo192.png',
  './logo512.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Cacheando arquivos essenciais');
      return cache.addAll(ASSETS);
    })
  );
});

// Ativação e limpeza imediata de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia Network-First para garantir dados sempre atualizados
self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET e conexões do Firebase/Firestore
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebase')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se a busca na rede funcionar, atualiza o cache e retorna a versão mais nova
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Se estiver OFFLINE, busca a versão salva do cache local
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('./index.html');
        });
      })
  );
});
