/** Bump junto com APP_BUILD_VERSION — SW só para navegação segura (sem Response.error). */
const CACHE_VERSION = "hb-coop-build-314";

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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Cold start PWA: SW legado (≤307) usava fetch(navigate).catch(() => Response.error())
 * → tela nativa "This page couldn't load". Nunca devolver erro de rede na navegação.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode !== "navigate") return;

  const bootUrl = new URL("/pwa-boot.html", self.location.origin).toString();
  const rescueHtml =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>location.replace("/pwa-boot.html")</script></head><body></body></html>';

  event.respondWith(
    fetch(event.request).catch(() =>
      fetch(bootUrl).catch(
        () =>
          new Response(rescueHtml, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
      )
    )
  );
});
