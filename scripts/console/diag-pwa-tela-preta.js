/**
 * Diagnóstico PWA — tela preta / "This page couldn't load"
 *
 * ONDE COLAR:
 * - Se o atalho abre tela preta: abra no Chrome normal (não pelo ícone)
 *   https://hbcooperativas.vercel.app/pwa-rescue.html?next=%2Flogin
 *   → F12 → Console → cole tudo → Enter
 * - Se o app já abriu: F12 → Console no próprio app.
 *
 * Envie ao suporte o JSON em window.__HB_PWA_DIAG__ (copie com copy(__HB_PWA_DIAG__))
 */
(async function hbDiagPwaTelaPreta() {
  "use strict";

  function swUrl(reg) {
    try {
      return (
        reg.active?.scriptURL ||
        reg.waiting?.scriptURL ||
        reg.installing?.scriptURL ||
        ""
      );
    } catch (e) {
      return "";
    }
  }

  function isStandalone() {
    try {
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
      );
    } catch (e) {
      return false;
    }
  }

  var diag = {
    quando: new Date().toISOString(),
    url: location.href,
    pathname: location.pathname,
    standalone: isStandalone(),
    online: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
    userAgent: navigator.userAgent,
    buildHtml: document.documentElement.getAttribute("data-app-build"),
    dplHtml: document.documentElement.getAttribute("data-dpl-id"),
    bootShellVisivel: (function () {
      var el = document.getElementById("hb-coop-boot-shell");
      if (!el) return null;
      var s = window.getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    })(),
    temSessaoLocal: (function () {
      try {
        return !!localStorage.getItem("coopeagriplla_session");
      } catch (e) {
        return "erro_ls";
      }
    })(),
    serviceWorker: {
      suportado: "serviceWorker" in navigator,
      controller: null,
      registrations: [],
    },
    caches: [],
    erros: [],
  };

  if ("serviceWorker" in navigator) {
    try {
      diag.serviceWorker.controller = navigator.serviceWorker.controller
        ? navigator.serviceWorker.controller.scriptURL
        : null;
      var regs = await navigator.serviceWorker.getRegistrations();
      diag.serviceWorker.registrations = regs.map(function (r) {
        return {
          scope: r.scope,
          active: r.active ? r.active.state + " " + r.active.scriptURL : null,
          waiting: r.waiting ? r.waiting.state + " " + r.waiting.scriptURL : null,
          installing: r.installing
            ? r.installing.state + " " + r.installing.scriptURL
            : null,
          legadoComQuery: swUrl(r).indexOf("sw.js?") >= 0,
        };
      });
    } catch (e) {
      diag.erros.push("sw: " + (e && e.message ? e.message : String(e)));
    }
  }

  if ("caches" in window) {
    try {
      diag.caches = await caches.keys();
    } catch (e) {
      diag.erros.push("caches: " + (e && e.message ? e.message : String(e)));
    }
  }

  try {
    var cr = await fetch("/api/client-release?_=" + Date.now(), {
      cache: "no-store",
      credentials: "same-origin",
    });
    diag.clientReleaseApi = cr.ok ? await cr.json() : { http: cr.status };
  } catch (e) {
    diag.clientReleaseApi = { erro: e && e.message ? e.message : String(e) };
  }

  try {
    var mf = await fetch("/manifest.webmanifest", { cache: "no-store" });
    if (mf.ok) {
      var man = await mf.json();
      diag.manifestStartUrl = man.start_url;
    }
  } catch (e) {
    diag.manifestStartUrl = "erro";
  }

  diag.recomendacoes = [];
  if (diag.serviceWorker.registrations.some(function (r) {
    return r.legadoComQuery;
  })) {
    diag.recomendacoes.push("SW legado (sw.js?build=) ainda registrado — abra /pwa-rescue.html");
  }
  if (
    diag.serviceWorker.controller &&
    diag.serviceWorker.controller.indexOf("sw.js") < 0
  ) {
    diag.recomendacoes.push("Controller SW estranho: " + diag.serviceWorker.controller);
  }
  if (diag.bootShellVisivel === true) {
    diag.recomendacoes.push("Shell de boot ainda visível — React pode não ter montado");
  }
  if (!diag.online) {
    diag.recomendacoes.push("Aparelho offline — navegação PWA pode falhar");
  }
  if (Number(diag.buildHtml) > 0 && Number(diag.buildHtml) < 320) {
    diag.recomendacoes.push("Build HTML antigo (" + diag.buildHtml + ") — aguarde deploy 320+ ou force atualizar");
  }

  window.__HB_PWA_DIAG__ = diag;
  console.log("=== HB PWA diagnóstico ===");
  console.log(JSON.stringify(diag, null, 2));
  console.log("Copiar para enviar: copy(__HB_PWA_DIAG__)");
  return diag;
})();
