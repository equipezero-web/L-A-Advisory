const CACHE_NAME = 'la-advisory-v3'; // Versão incrementada para forçar atualização em todos os aparelhos

// Arquivos essenciais estáticos
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './logo192.png',
  './logo512.png', // <--- Vírgula corrigida aqui
  '/loja.html',
  '/carrinho.html',
  '/checkout.html',
  '/css/style.css',
  '/js/carrinho.js',
  '/js/loja.js',
  '/js/checkout.js',
  '/produtos/produtos.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;600&display=swap'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Cache inicial guardado com sucesso.');
      return cache.addAll(ASSETS);
    })
  );
});

// Ativação: Limpa caches antigos quando houver atualização de versão
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
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
        // Se a busca na rede funcionar (status 200/304 e tipo básico/cors), atualiza o cache
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
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
