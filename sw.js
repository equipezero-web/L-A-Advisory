const CACHE_NAME = 'la-royal-v1';
const ASSETS = ['./', './index.html',  './manifest.json', 'https://cdn.tailwindcss.com', 'https://unpkg.com/lucide@latest'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE_NAME).map(x => caches.delete(x))))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
