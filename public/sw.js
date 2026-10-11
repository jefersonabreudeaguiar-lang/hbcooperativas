/**
 * Substitui SW legado que falhava em navigate. Mantém-se ativo só com passthrough (sem cache).
 */
const CACHE_VERSION = "hb-coop-build-323-nav-pass";

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

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response(
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>HB Cooperativas</title></head><body style="font-family:system-ui,sans-serif;padding:1.25rem;background:#f0fdf4;color:#14532d"><h1>Sem conexão</h1><p>Abra com Wi‑fi ou dados móveis.</p><p><a href="/pwa-rescue.html">Reparar atalho</a></p></body></html>',
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })
  );
});
