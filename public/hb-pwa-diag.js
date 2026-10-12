/* HB Cooperativas — diagnóstico PWA (console). Carregue: fetch('/hb-pwa-diag.js').then(r=>r.text()).then(eval).then(()=>HB_PWA_DIAG_RUN()) */
window.HB_PWA_DIAG_RUN = async function HB_PWA_DIAG_RUN() {
  "use strict";
  var DPL_RE = /^dpl_[A-Za-z0-9]{20,}$/;
  var CRASH_KEY = "hb-coop-runtime-crash-log";

  function dplFromUrl(u) {
    if (!u) return null;
    var m = String(u).match(/[?&]dpl=([^&]+)/);
    if (!m) return null;
    try {
      var id = decodeURIComponent(m[1]).trim();
      return DPL_RE.test(id) ? id : null;
    } catch (e) {
      return null;
    }
  }

  function chunkDpls() {
    var out = [];
    var seen = {};
    document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function (el) {
      var id = dplFromUrl(el.src || el.href || "");
      if (id && !seen[id]) {
        seen[id] = 1;
        out.push(id);
      }
    });
    return out;
  }

  function standalone() {
    try {
      return (
        window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
      );
    } catch (e) {
      return false;
    }
  }

  var pageBuild = parseInt(document.documentElement.getAttribute("data-app-build") || "0", 10) || 0;
  var pageDpl = (document.documentElement.getAttribute("data-dpl-id") || "").trim();
  var chunks = chunkDpls();
  var crashLog = [];
  try {
    var raw = localStorage.getItem(CRASH_KEY);
    if (raw) crashLog = JSON.parse(raw);
    if (!Array.isArray(crashLog)) crashLog = [];
  } catch (e) {
    crashLog = [];
  }

  var cloud = null;
  try {
    var cr = await fetch("/api/client-release?_=" + Date.now(), {
      cache: "no-store",
      credentials: "same-origin",
    });
    cloud = cr.ok ? await cr.json() : { http: cr.status };
  } catch (e) {
    cloud = { erro: String(e) };
  }

  var swRegs = [];
  if ("serviceWorker" in navigator) {
    try {
      var regs = await navigator.serviceWorker.getRegistrations();
      swRegs = regs.map(function (r) {
        var u =
          (r.active && r.active.scriptURL) ||
          (r.waiting && r.waiting.scriptURL) ||
          (r.installing && r.installing.scriptURL) ||
          "";
        return { scope: r.scope, scriptURL: u, legado: u.indexOf("sw.js?") >= 0 };
      });
    } catch (e) {
      swRegs = [{ erro: String(e) }];
    }
  }

  var cacheKeys = [];
  if ("caches" in window) {
    try {
      cacheKeys = await caches.keys();
    } catch (e) {
      cacheKeys = ["erro:" + e];
    }
  }

  var storage = {
    buildSeen: localStorage.getItem("hb-coop-app-build-seen"),
    repairLocal: localStorage.getItem("hb-coop-pwa-repair-done-build"),
    repairSession: sessionStorage.getItem("hb-coop-pwa-repair-done"),
    directEntry: sessionStorage.getItem("hb-coop-pwa-direct-entry"),
    temSessao: !!localStorage.getItem("coopeagriplla_session"),
  };

  var causas = [];
  var cloudBuild = cloud && cloud.build ? Number(cloud.build) : 0;
  var cloudDpl = cloud && cloud.deploymentId ? String(cloud.deploymentId).trim() : "";

  if (pageBuild > 0 && cloudBuild > 0 && pageBuild < cloudBuild) {
    causas.push("HTML_ANTIGO: pagina build " + pageBuild + " < nuvem " + cloudBuild);
  }
  if (chunks.length > 1) {
    causas.push("CHUNKS_MISTOS: " + chunks.join(" | "));
  }
  if (pageDpl && chunks.some(function (c) { return c !== pageDpl; })) {
    causas.push("DPL_HTML_DIFERENTE_DO_CHUNK: html=" + pageDpl);
  }
  if (swRegs.some(function (r) { return r.legado; })) {
    causas.push("SW_LEGADO sw.js?build= ainda registrado");
  }
  if (storage.repairLocal && pageBuild && String(storage.repairLocal) !== String(pageBuild) && Number(storage.repairLocal) < pageBuild - 1) {
    causas.push("REPARO_LOCAL_DESATUALIZADO: " + storage.repairLocal + " vs page " + pageBuild);
  }
  var crashRecent = crashLog.filter(function (e) {
    if (!e) return false;
    if (pageBuild && e.build && String(e.build) !== String(pageBuild)) return false;
    if (cloudDpl && e.chunkDpls && e.chunkDpls.length && e.chunkDpls.indexOf(cloudDpl) < 0) return false;
    if (cloudDpl && e.src && e.src.indexOf(cloudDpl) < 0 && e.chunkDpls && !e.chunkDpls.length) return false;
    return true;
  });
  if (crashRecent.length) {
    var last = crashRecent[crashRecent.length - 1];
    if (last && /before initialization|ChunkLoadError|Loading chunk/i.test(String(last.message))) {
      causas.push("CRASH_JS_AGORA: " + String(last.message).slice(0, 120));
    }
  } else if (crashLog.length) {
    causas.push("CRASH_LOG_ANTIGO: " + crashLog.length + " entrada(s) de build/dpl anterior — limpe e recarregue");
  }
  if (!navigator.onLine) {
    causas.push("OFFLINE");
  }
  if (causas.length === 0) {
    causas.push("Nenhum sinal obvio agora — rode logo apos ver This page could not load");
  }

  var resumo =
    "[HB PWA] standalone=" +
    standalone() +
    " | build pagina=" +
    pageBuild +
    " nuvem=" +
    cloudBuild +
    " | dpl html=" +
    (pageDpl || "?") +
    " chunks=" +
    chunks.length +
    " | causas: " +
    causas.join("; ");

  var diag = {
    quando: new Date().toISOString(),
    resumo: resumo,
    url: location.href,
    standalone: standalone(),
    online: navigator.onLine,
    pageBuild: pageBuild,
    pageDpl: pageDpl,
    chunkDpls: chunks,
    clientRelease: cloud,
    storage: storage,
    serviceWorkers: swRegs,
    swController: navigator.serviceWorker && navigator.serviceWorker.controller
      ? navigator.serviceWorker.controller.scriptURL
      : null,
    cacheKeys: cacheKeys,
    crashLog: crashLog.slice(-5),
    crashLogBuildAtual: crashRecent.slice(-3),
    causasProvaveis: causas,
    acoesRecomendadas: [
      "Chrome (nao Edge): " + location.origin + "/pwa-rescue.html?auto=1&next=%2Flogin%3Fhb-pwa%3D" + (cloudBuild || pageBuild),
      "Remover icone e reinstalar apos rescue",
      "Enviar: copy(JSON.stringify(__HB_PWA_DIAG__,null,2))",
    ],
  };

  window.__HB_PWA_DIAG__ = diag;
  console.log("%c=== HB PWA DIAGNOSTICO ===", "color:#15803d;font-weight:bold");
  console.log(resumo);
  console.log(JSON.stringify(diag, null, 2));
  console.log("Copiar tudo: copy(__HB_PWA_DIAG__)");
  return diag;
};
