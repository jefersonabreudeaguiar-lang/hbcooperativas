/**
 * Passthrough — documentos e chunks Next sempre pela rede (evita TDZ por dpl antigo).
 */
const CACHE_VERSION = "hb-coop-build-719-chunk-network-v1";

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
  if (!isDocumentNavigation(event.request)) return;
  event.respondWith(
    fetch(event.request, { redirect: "follow", credentials: "same-origin", cache: "no-store" }).catch(
      () => {
        return new Response(
          '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>HB Cooperativas</title></head><body style="font-family:system-ui,sans-serif;padding:1.25rem;background:#f0fdf4;color:#14532d"><h1>Sem conexão</h1><p>Verifique Wi‑fi ou dados móveis e abra de novo.</p><p><a href="/pwa-rescue.html">Reparar atalho</a></p></body></html>',
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    )
  );
});
