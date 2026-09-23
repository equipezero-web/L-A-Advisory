const VERSAO_CACHE = "royal-advisory-v4";

const ARQUIVOS_INICIAIS = [
    "./",
    "./index.html",
    "./manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(VERSAO_CACHE)
            .then((cache) => {
                console.log("Instalando cache:", VERSAO_CACHE);

                return cache.addAll(ARQUIVOS_INICIAIS);
            })
            .then(() => {
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((nomesDosCaches) => {
                return Promise.all(
                    nomesDosCaches.map((nomeDoCache) => {
                        if (nomeDoCache !== VERSAO_CACHE) {
                            console.log("Apagando cache antigo:", nomeDoCache);

                            return caches.delete(nomeDoCache);
                        }

                        return null;
                    })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.tipo === "ATUALIZAR_AGORA") {
        self.skipWaiting();
    }
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    if (event.request.url.includes("firestore.googleapis.com")) {
        return;
    }

    if (event.request.url.includes("firebase.googleapis.com")) {
        return;
    }

    if (event.request.url.includes("identitytoolkit.googleapis.com")) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((respostaDaRede) => {
                if (!respostaDaRede || respostaDaRede.status !== 200) {
                    return respostaDaRede;
                }

                const copiaResposta = respostaDaRede.clone();

                caches.open(VERSAO_CACHE)
                    .then((cache) => {
                        cache.put(event.request, copiaResposta);
                    });

                return respostaDaRede;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then((respostaDoCache) => {
                        if (respostaDoCache) {
                            return respostaDoCache;
                        }

                        if (event.request.mode === "navigate") {
                            return caches.match("./index.html");
                        }

                        return new Response(
                            "Você está offline e este conteúdo não está salvo.",
                            {
                                status: 503,
                                headers: {
                                    "Content-Type": "text/plain; charset=utf-8"
                                }
                            }
                        );
                    });
            })
    );
});
