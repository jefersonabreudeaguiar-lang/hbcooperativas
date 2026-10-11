/**
 * Service worker "tombstone" — substitui SW legado (≤307) que usava Response.error() no navigate.
 * Sem listener "fetch": o browser trata navegação na rede (sem tela "This page couldn't load").
 * Após ativar, desregistra a si mesmo e limpa caches antigos.
 */
const CACHE_VERSION = "hb-coop-build-317-tombstone";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
