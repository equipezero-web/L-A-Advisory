// Public PWA shell. Navigation and scripts/styles must always prefer fresh network content.
const CACHE_NAME = "la-royal-advisory-v73";
const CACHE_PREFIX = "la-royal-advisory-";

const urlsToCache = [
    "./",
    "./index.html",
    "./manifest.json",
    "./assets/royal-ocean-theme.css",
    "./assets/royal-ocean-unified.css",
    "./assets/royal-mobile-polish.css",
    "./assets/store-audience-tabs.css",
    "./assets/royal-ocean-complete.css",
    "./assets/royal-storefront-upgrade.css",
    "./js/royal-storefront-ui.js",
    "./js/royal-storefront-state.js",
    "./js/royal-product-i18n.js",
    "./js/royal-market-pricing.js",
    "./js/royal-ai-product-analysis.js",
    "./js/royal-product-finance.js",
    "./js/advisory-ai.js",
    "./icons/icons-192.png",
    "./icons/icons-512.png",
    "./icons/maskable-512.png"
];

const shellPaths = new Set(
    urlsToCache.map(path => new URL(path, self.registration.scope).pathname)
);

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Avoid seeding a new cache with an older HTTP/browser-cached release.
        await cache.addAll(urlsToCache.map(path =>
            new Request(new URL(path, self.registration.scope).href, { cache: "reload" })
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

// Never cache API replies, checkout or customer information.
self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                // GitHub Pages/browser caches must not decide which release opens.
                return await fetch(request, { cache: "no-store" });
            } catch {
                const cache = await caches.open(CACHE_NAME);
                return await cache.match(new URL("./index.html", self.registration.scope).href)
                    || Response.error();
            }
        })());
        return;
    }

    // Other public scripts/styles are also loaded fresh, even when not precached.
    if (!shellPaths.has(url.pathname)) {
        if (/\.(?:js|css|html)$/i.test(url.pathname)) {
            event.respondWith(fetch(request, { cache: "no-store" }));
        }
        return;
    }

    event.respondWith((async () => {
        try {
            const response = await fetch(request, { cache: "no-store" });
            if (response.ok && response.type === "basic") {
                try {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                } catch {
                    // Storage quota failures must not prevent the fresh version loading.
                }
            }
            return response;
        } catch {
            // Cached public shell is an offline fallback only, not the default.
            const cache = await caches.open(CACHE_NAME);
            return await cache.match(request, { ignoreSearch: true }) || Response.error();
        }
    })());
});

self.addEventListener("message", event => {
    const source = event.source;
    if (!source || !source.url) return;
    try {
        const clientUrl = new URL(source.url);
        if (clientUrl.origin !== self.location.origin) return;
        if (!clientUrl.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    } catch {
        return;
    }
    if (event.data === "SKIP_WAITING" || event.data?.tipo === "ATUALIZAR_AGORA") {
        event.waitUntil(self.skipWaiting());
    }
});
