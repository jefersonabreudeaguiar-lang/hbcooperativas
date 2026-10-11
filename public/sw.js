/**
 * Passthrough de documentos — substitui SW legado que gerava “This page couldn’t load”.
 * Sem cache de app; só navigate → rede.
 */
const CACHE_VERSION = "hb-coop-build-338-nav-pass";

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

function isDocumentNavigation(request) {
  if (request.mode === "navigate") return true;
  if (request.method !== "GET") return false;
  const accept = request.headers.get("accept") || "";
  return accept.indexOf("text/html") >= 0;
}

self.addEventListener("fetch", (event) => {
  if (!isDocumentNavigation(event.request)) return;
  event.respondWith(
    fetch(event.request, { redirect: "follow", credentials: "same-origin" }).catch(() => {
      return new Response(
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>HB Cooperativas</title></head><body style="font-family:system-ui,sans-serif;padding:1.25rem;background:#f0fdf4;color:#14532d"><h1>Sem conexão</h1><p>Verifique Wi‑fi ou dados móveis e abra de novo.</p><p><a href="/pwa-rescue.html">Reparar atalho</a></p></body></html>',
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })
  );
});
