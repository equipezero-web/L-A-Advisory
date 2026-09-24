const VERSAO_CACHE = "la-royal-advisory-v7";

const ARQUIVOS_INICIAIS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo192.png",
  "./logo512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSAO_CACHE)
      .then((cache) => {
        return cache.addAll(ARQUIVOS_INICIAIS);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomesDosCaches) => {
        return Promise.all(
          nomesDosCaches.map((nomeDoCache) => {
            if (nomeDoCache !== VERSAO_CACHE) {
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
  if (event.data?.tipo === "ATUALIZAR_AGORA") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const requisicao = event.request;
  const url = new URL(requisicao.url);

  if (requisicao.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(requisicao)
      .then((respostaDaRede) => {
        if (
          !respostaDaRede ||
          respostaDaRede.status !== 200 ||
          respostaDaRede.type !== "basic"
        ) {
          return respostaDaRede;
        }

        const copiaResposta = respostaDaRede.clone();

        caches.open(VERSAO_CACHE).then((cache) => {
          cache.put(requisicao, copiaResposta);
        });

        return respostaDaRede;
      })
      .catch(async () => {
        const respostaDoCache = await caches.match(requisicao);

        if (respostaDoCache) {
          return respostaDoCache;
        }

        if (requisicao.mode === "navigate") {
          return caches.match("./index.html");
        }

        return new Response(
          "Você está offline. Conecte-se à internet para acessar este conteúdo.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      })
  );
});
