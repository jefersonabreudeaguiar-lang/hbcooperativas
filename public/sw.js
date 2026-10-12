/**
 * HB Cooperativas — Service Worker passthrough.
 * Bump CACHE_VERSION a cada mudança de estratégia (força o Chrome a baixar este arquivo).
 * HTML / navigate: SEMPRE rede primeiro — nunca Cache API nem fallback de HTML antigo online.
 */
const CACHE_VERSION = "hb-coop-build-349-network-first-v2";

const OFFLINE_HTML =
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>HB Cooperativas</title></head><body style="font-family:system-ui,sans-serif;padding:1.25rem;background:#f0fdf4;color:#14532d"><h1>Sem conexão</h1><p>Verifique Wi‑fi ou dados móveis e abra de novo.</p><p><a href="/pwa-rescue.html">Reparar atalho</a></p></body></html>';

/** Remove todo cache legado (precache antigo que causava HTML stale). */
function deleteAllCaches() {
  if (!self.caches) return Promise.resolve();
  return caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (key) { return caches.delete(key); }));
  });
}

/** Assume controle na hora — não espera fechar todas as abas. */
self.addEventListener("install", function (event) {
  event.waitUntil(
    Promise.all([deleteAllCaches(), self.skipWaiting()])
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    deleteAllCaches()
      .then(function () { return self.clients.claim(); })
      .then(function () {
        return self.clients.matchAll({ type: "window", includeUncontrolled: true });
      })
      .then(function (clients) {
        clients.forEach(function (client) {
          try {
            client.postMessage({ type: "HB_SW_ACTIVATED", version: CACHE_VERSION });
          } catch (e) {
            /* ignore */
          }
        });
      })
  );
});

self.addEventListener("message", function (event) {
  var data = event.data;
  if (!data) return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isHtmlDocumentRequest(request) {
  if (request.method !== "GET") return false;
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  var accept = request.headers.get("accept") || "";
  if (accept.indexOf("text/html") >= 0) return true;
  try {
    var path = new URL(request.url).pathname;
    if (/\.html$/i.test(path)) return true;
    if (
      path === "/pwa-launch.html" ||
      path === "/pwa-rescue.html" ||
      path === "/pwa-diag.html" ||
      path === "/pwa-boot.html"
    ) {
      return true;
    }
  } catch (e) {
    /* ignore */
  }
  return false;
}

function isNextAsset(request) {
  if (request.method !== "GET") return false;
  try {
    return new URL(request.url).pathname.indexOf("/_next/") >= 0;
  } catch (e) {
    return false;
  }
}

var NETWORK_FETCH_OPTS = {
  redirect: "follow",
  credentials: "same-origin",
  cache: "no-store",
};

/**
 * Network-first estrito: nunca caches.match() para HTML.
 * Offline → página sintética 503 (não HTML antigo do precache).
 */
function networkFirstHtml(request) {
  return fetch(request, NETWORK_FETCH_OPTS).catch(function () {
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  });
}

function networkOnlyAsset(request) {
  return fetch(request, NETWORK_FETCH_OPTS).catch(function () {
    return fetch(request);
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (isHtmlDocumentRequest(request)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  if (isNextAsset(request)) {
    event.respondWith(networkOnlyAsset(request));
    return;
  }
});
