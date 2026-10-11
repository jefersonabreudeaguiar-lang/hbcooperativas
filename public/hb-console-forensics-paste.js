/* eslint-disable */
window.HB_COOP_RUN_FORENSICS = async function HB_COOP_CONSOLE_FORENSICS() {
  "use strict";
  var DPL_RE = /^dpl_[A-Za-z0-9]{20,}$/;
  var BUILD_SEEN = "hb-coop-app-build-seen";
  var REPAIR_KEY = "hb-coop-pwa-repair-done";
  var CRASH_KEY = "hb-coop-runtime-crash-log";
  var SESSION_KEY = "coopeagriplla_session";

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

  function chunkDplsFromDom() {
    var out = [];
    var seen = {};
    document.querySelectorAll('script[src*="dpl="], link[href*="dpl="]').forEach(function (el) {
      var u = el.src || el.href || "";
      var id = dplFromUrl(u);
      if (id && !seen[id]) {
        seen[id] = 1;
        out.push(id);
      }
    });
    return out;
  }

  function readLs(prefix) {
    var o = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        var v = localStorage.getItem(k);
        o[k] = v && v.length > 220 ? v.slice(0, 220) + "…(" + v.length + ")" : v;
      }
    } catch (e) {
      o._erro = String(e);
    }
    return o;
  }

  function readSs(prefix) {
    var o = {};
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        o[k] = sessionStorage.getItem(k);
      }
    } catch (e) {
      o._erro = String(e);
    }
    return o;
  }

  function extractDplsFromHtml(html) {
    var seen = {};
    var tagRe = /<(script|link)[^>]+(?:src|href)="([^"]+)"/gi;
    var m;
    while ((m = tagRe.exec(html)) !== null) {
      var id = dplFromUrl(m[2]);
      if (id) seen[id] = 1;
    }
    var meta = html.match(/data-dpl-id="([^"]+)"/);
    if (meta && meta[1] && DPL_RE.test(meta[1].trim())) seen[meta[1].trim()] = 1;
    return Object.keys(seen);
  }

  function metaFromHtml(html, attr) {
    var re = new RegExp(attr + '="([^"]*)"');
    var m = html.match(re);
    return m ? m[1] : "";
  }

  async function fetchHtml(path) {
    var url = path + (path.indexOf("?") >= 0 ? "&" : "?") + "_hbfx=" + Date.now();
    var r = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/html", "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    return { status: r.status, ok: r.ok, html: await r.text() };
  }

  async function probeChunkFetch(scriptUrl) {
    try {
      var r = await fetch(scriptUrl, { cache: "no-store", method: "GET" });
      return {
        url: scriptUrl,
        status: r.status,
        ok: r.ok,
        ct: r.headers.get("content-type"),
      };
    } catch (e) {
      return { url: scriptUrl, erro: String(e) };
    }
  }

  var nav = performance.getEntriesByType("navigation")[0];
  var report = {
    schema: "hb-console-forensics-v2",
    quando: new Date().toISOString(),
    href: location.href,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    navigation: nav
      ? { type: nav.type, durationMs: Math.round(nav.duration), transferSize: nav.transferSize }
      : null,
    paginaAtual: {
      build: document.documentElement.getAttribute("data-app-build"),
      dpl: document.documentElement.getAttribute("data-dpl-id"),
      gitSha: document.documentElement.getAttribute("data-git-sha"),
      chunkDpls: chunkDplsFromDom(),
      scriptsComDpl: Array.prototype.slice
        .call(document.querySelectorAll('script[src*="dpl="]'), 0, 10)
        .map(function (s) {
          return s.src;
        }),
    },
    storage: {
      buildSeen: localStorage.getItem(BUILD_SEEN),
      repairDone: sessionStorage.getItem(REPAIR_KEY),
      temSessao: !!localStorage.getItem(SESSION_KEY),
      hbCoopLocalStorage: readLs("hb-coop"),
      hbCoopSessionStorage: readSs("hb-coop"),
    },
    serviceWorker: { controller: null, registrations: [] },
    caches: [],
    clientRelease: null,
    rotas: {},
    chunkProbe: [],
    crashLog: [],
    errosDuranteProbe: [],
    causasProvaveis: [],
    acoes: [],
  };

  try {
    var raw = localStorage.getItem(CRASH_KEY);
    report.crashLog = raw ? JSON.parse(raw) : [];
  } catch (e) {
    report.crashLog = [];
    report.errosDuranteProbe.push("crashLog: " + e);
  }

  if ("serviceWorker" in navigator) {
    report.serviceWorker.controller = navigator.serviceWorker.controller
      ? navigator.serviceWorker.controller.scriptURL
      : null;
    try {
      var regs = await navigator.serviceWorker.getRegistrations();
      report.serviceWorker.registrations = regs.map(function (r) {
        return {
          scope: r.scope,
          script:
            (r.active && r.active.scriptURL) ||
            (r.waiting && r.waiting.scriptURL) ||
            (r.installing && r.installing.scriptURL) ||
            "",
        };
      });
    } catch (e) {
      report.errosDuranteProbe.push("sw: " + e);
    }
  }

  if ("caches" in window) {
    try {
      report.caches = await caches.keys();
    } catch (e) {
      report.caches = ["erro"];
    }
  }

  try {
    var cr = await fetch("/api/client-release?_=" + Date.now(), { cache: "no-store" });
    report.clientRelease = cr.ok ? await cr.json() : { http: cr.status };
  } catch (e) {
    report.clientRelease = { erro: String(e) };
  }

  var paths = ["/login", "/dashboard", "/pwa-rescue.html"];
  for (var pi = 0; pi < paths.length; pi++) {
    var path = paths[pi];
    try {
      var fh = await fetchHtml(path);
      var dpls = extractDplsFromHtml(fh.html);
      report.rotas[path] = {
        http: fh.status,
        ok: fh.ok,
        build: metaFromHtml(fh.html, "data-app-build"),
        dpl: metaFromHtml(fh.html, "data-dpl-id"),
        dplsEmAssets: dpls,
        mixedDeploy: dpls.length > 1,
      };
    } catch (e) {
      report.rotas[path] = { erro: String(e) };
    }
  }

  var samples = report.paginaAtual.scriptsComDpl.slice(0, 3);
  for (var si = 0; si < samples.length; si++) {
    report.chunkProbe.push(await probeChunkFetch(samples[si]));
  }

  var cloud = report.clientRelease || {};
  var cloudBuild = cloud.build ? Number(cloud.build) : 0;
  var seenBuild = Number(report.storage.buildSeen || 0);
  var pageBuild = Number(report.paginaAtual.build || 0);
  var pageDpl = (report.paginaAtual.dpl || "").trim();
  var chunks = report.paginaAtual.chunkDpls;

  if (seenBuild > 0 && cloudBuild > 0 && seenBuild < cloudBuild) {
    report.causasProvaveis.push("PERFIL_ANTIGO: buildSeen=" + seenBuild + " < nuvem=" + cloudBuild);
  }
  if (pageBuild > 0 && cloudBuild > 0 && pageBuild < cloudBuild) {
    report.causasProvaveis.push("HTML_ANTIGO: build pagina=" + pageBuild + " < nuvem=" + cloudBuild);
  }
  if (chunks.length > 1) {
    report.causasProvaveis.push("CHUNKS_MISTOS_NA_TELA: " + chunks.join(", "));
  }
  if (pageDpl && chunks.length) {
    for (var ci = 0; ci < chunks.length; ci++) {
      if (chunks[ci] !== pageDpl) {
        report.causasProvaveis.push("DPL_HTML_VS_CHUNK: html=" + pageDpl + " chunk=" + chunks[ci]);
        break;
      }
    }
  }
  if (!report.storage.repairDone || String(report.storage.repairDone) !== String(cloudBuild || pageBuild)) {
    report.causasProvaveis.push("REPARO_NAO_MARCADO_PARA_BUILD_ATUAL");
  }
  if (report.crashLog.length) {
    var last = report.crashLog[report.crashLog.length - 1];
    if (last && last.message && /before initialization/i.test(last.message)) {
      report.causasProvaveis.push("TDZ_GRAVADO: " + String(last.message).slice(0, 140));
    }
  }
  if (/Edg\//i.test(navigator.userAgent) && !report.standalone) {
    report.causasProvaveis.push("EDGE: cache separado do Chrome/WebAPK no celular");
  }
  if (report.causasProvaveis.length === 0) {
    report.causasProvaveis.push("Sem sinal agora — rode logo apos a tela preta no /dashboard");
  }

  report.acoes = [
    "pwa-rescue auto next login hb-pwa=" + (cloudBuild || "?"),
    "Limpar dados do site no Chrome (nao Edge)",
    "Remover icone e reinstalar",
  ];

  window.__HB_COOP_FORENSICS__ = report;
  var text = JSON.stringify(report, null, 2);
  console.log("=== HB COOP FORENSICS v2 ===\n", text);
  try {
    await navigator.clipboard.writeText(text);
    console.log("OK: JSON copiado para area de transferencia.");
  } catch (e) {
    console.log("Copie: copy(JSON.stringify(__HB_COOP_FORENSICS__,null,2))");
  }
  return report;
};
