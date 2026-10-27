/**
 * Passthrough — documentos e chunks Next sempre pela rede (evita TDZ por dpl antigo).
 */
const CACHE_VERSION = "hb-coop-build-745-chunk-network-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNextAsset(request) {
  if (request.method !== "GET") return false;
  try {
    const path = new URL(request.url).pathname;
    return path.indexOf("/_next/") >= 0;
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  if (isNextAsset(event.request)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store", credentials: "same-origin" }).catch(() =>
        fetch(event.request)
      )
    );
    return;
  }
  /* Documentos: não interceptar — SW no navigate causava “This page couldn’t load” no Chrome/Android. */
});
