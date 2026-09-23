const VERSAO_CACHE = "royal-advisory-v5";

const ARQUIVOS_INICIAIS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo192.png",
  "./logo512.png"
];

const ORIGEM_ATUAL = self.location.origin;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSAO_CACHE)
      .then((cache) => cache.addAll(ARQUIVOS_INICIAIS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomesDosCaches) =>
        Promise.all(
          nomesDosCaches.map((nomeDoCache) => {
            if (nomeDoCache !== VERSAO_CACHE) {
              return caches.delete(nomeDoCache);
            }

            return null;
          })
        )
      )
      .then(() => self.clients.claim())
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

  if (url.origin !== ORIGEM_ATUAL) {
    return;
  }

  if (
    url.pathname.includes("/api/") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebase.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com")
  ) {
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
          "Você está offline e este conteúdo ainda não foi salvo neste dispositivo.",
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
