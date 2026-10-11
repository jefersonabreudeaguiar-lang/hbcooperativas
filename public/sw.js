/**
 * Arquivo mantido só para o browser substituir SW legado (≤307) que interceptava navigate.
 * Sem listener "fetch". Ao ativar, limpa caches e desregistra — não permanece controlando o site.
 */
const CACHE_VERSION = "hb-coop-build-318-retired";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
