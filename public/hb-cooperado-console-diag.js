/**
 * HB Cooperado — diagnóstico completo no console (browser ou PWA).
 * Cole no DevTools (F12 → Console) com o cooperado já logado na mesma aba.
 *
 * Uso:
 *   await __HB_COOPERADO_DIAG_RUN__()
 *   await __HB_COOPERADO_DIAG_COPY__()
 */
(function () {
  "use strict";

  const SCHEMA = "hb-cooperado-console-diag-v1";
  const SESSION_KEY = "coopeagriplla_session";
  const DATA_KEY = "coopeagriplla_data";
  const OP_SYNC = "hb-coop-operacional-synced-build";
  const PWA_SNAP = "hb-coop-pwa-snapshots-materialized-build";
  const BUILD_SEEN = "hb-coop-app-build-seen";
  const TRACE_RING = "hb.coop.mobile.trace.ring";

  function safeJson(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function scanStorage(prefix) {
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.includes(prefix)) continue;
      const v = localStorage.getItem(k);
      rows.push({
        key: k,
        bytes: v ? v.length * 2 : 0,
        preview: v && v.length > 120 ? v.slice(0, 120) + "…" : v,
      });
    }
    return rows.sort((a, b) => b.bytes - a.bytes);
  }

  function readSnaps(cooperadoId) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.includes("hb.coop.")) continue;
      if (cooperadoId && !k.includes(cooperadoId)) continue;
      const o = safeJson(localStorage.getItem(k));
      if (!o || typeof o !== "object") continue;
      const display = o.display;
      const view = o.view;
      out.push({
        key: k,
        appBuild: o.appBuild ?? view?.appBuild ?? null,
        valor:
          display?.valor ??
          view?.valorReceber?.valor ??
          view?.valorReceber?.valorExibicao ??
          o.paridade?.valorLiquido ??
          null,
      });
    }
    return out;
  }

  function roughFinanceFromAppData(data, cooperadoId) {
    if (!data || !cooperadoId) return null;
    let pendente = 0;
    let pendenteLinhas = 0;
    let notasConferidas = 0;
    let pixAguardando = 0;
    for (const f of data.fichaCorrida || []) {
      if (f.cooperadoId !== cooperadoId && f.cooperadoId) {
        /* ids duplicados — tenta match parcial */
      }
      const cid = String(f.cooperadoId || "");
      if (cid && cid !== cooperadoId && !cid.endsWith(cooperadoId.slice(-8))) continue;
      if (f.status === "pendente") {
        pendente += Number(f.valorLiquido || 0);
        pendenteLinhas++;
      }
    }
    for (const n of data.notasPedido || []) {
      if (n.cooperadoId === cooperadoId && n.status === "conferida") notasConferidas++;
    }
    for (const p of data.pagamentosCooperado || []) {
      if (p.cooperadoId === cooperadoId && p.status === "aguardando_confirmacao") pixAguardando++;
    }
    return { pendenteLinhas, pendenteSoma: pendente, notasConferidas, pixAguardando };
  }

  async function buildReport() {
    const html = document.documentElement;
    const pageBuild = parseInt(html.getAttribute("data-app-build") || "0", 10) || 0;
    const pageDpl = html.getAttribute("data-dpl-id") || null;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;

    let nuvem = null;
    try {
      const r = await fetch("/api/client-release?_=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
      nuvem = r.ok ? await r.json() : { http: r.status };
    } catch (e) {
      nuvem = { erro: String(e) };
    }
    const cloudBuild = Number(nuvem?.build || 0);

    const sess = safeJson(localStorage.getItem(SESSION_KEY));
    const user = sess?.user || sess || {};
    const cooperadoId = String(user.cooperadoId || "").trim();
    const cooperativaId = String(user.cooperativaId || "").trim();
    const role = user.role || sess?.role || "?";

    const appDataRaw = localStorage.getItem(DATA_KEY);
    const appData = safeJson(appDataRaw);
    const appDataKb = appDataRaw ? Math.round((appDataRaw.length * 2) / 1024) : 0;
    const financeRough = roughFinanceFromAppData(appData, cooperadoId);

    const operSync = Number(localStorage.getItem(OP_SYNC) || 0);
    const pwaMat = Number(localStorage.getItem(PWA_SNAP) || 0);
    const buildSeen = Number(localStorage.getItem(BUILD_SEEN) || 0);
    const hintAt = cooperadoId
      ? Number(localStorage.getItem("hb-coop-lancamento-hint-at:" + cooperadoId) || 0)
      : 0;

    let traceRing = [];
    try {
      traceRing = JSON.parse(sessionStorage.getItem(TRACE_RING) || "[]");
    } catch {
      traceRing = [];
    }

    let sw = { controller: false, scriptURL: null };
    try {
      sw.controller = Boolean(navigator.serviceWorker?.controller);
      sw.scriptURL = navigator.serviceWorker?.controller?.scriptURL || null;
    } catch {
      /* ignore */
    }

    const builtIn = window.__HB_COOP_VALOR_DIAG__ || null;
    let builtInFresh = null;
    if (typeof window.__hbCoopValorDiag?.run === "function") {
      try {
        builtInFresh = await window.__hbCoopValorDiag.run();
      } catch (e) {
        builtInFresh = { erro: String(e) };
      }
    }

    const causas = [];
    if (role !== "cooperado") causas.push("NAO_E_COOPERADO: faça login como cooperado nesta aba");
    if (!cooperadoId) causas.push("SEM_COOPERADO_ID_NA_SESSAO");
    if (cloudBuild && pageBuild && pageBuild < cloudBuild) {
      causas.push("HTML_ATRAS_NUVEM: build " + pageBuild + " < " + cloudBuild + " — Reparar atalho ou hard refresh");
    }
    if (cloudBuild && buildSeen < cloudBuild) {
      causas.push("BUILD_SEEN_ATRAS: " + buildSeen + " < " + cloudBuild);
    }
    if (cloudBuild && operSync < cloudBuild) {
      causas.push("OPERACIONAL_SYNC_BUILD_ATRAS: " + operSync + " < " + cloudBuild + " — pode disparar sync pós-deploy");
    }
    if (financeRough && financeRough.pendenteSoma > 0.01) {
      const snap = readSnaps(cooperadoId).find((s) => s.valor != null);
      if (!snap || snap.valor === 0) {
        causas.push("MOTOR_TEM_PENDENTE_MAS_SNAPSHOT_ZERADO: ficha R$ " + financeRough.pendenteSoma.toFixed(2));
      }
    }
    if (sw.controller && cloudBuild && pageBuild < cloudBuild) {
      causas.push("SW_ATIVO_COM_BUILD_ANTIGO: limpe cache ou /pwa-rescue.html");
    }
    if (!causas.length) causas.push("Nenhuma causa automática — envie o JSON completo para análise.");

    const report = {
      schema: SCHEMA,
      quando: new Date().toISOString(),
      href: location.href,
      dispositivo: {
        standalone,
        mobile: window.matchMedia("(max-width: 1023px)").matches,
        online: navigator.onLine,
        ua: navigator.userAgent,
      },
      conta: { role, cooperadoId, cooperativaId, email: user.email || null },
      release: { pageBuild, pageDpl, nuvem },
      storage: {
        operacionalSyncedBuild: operSync,
        pwaSnapshotsMaterializedBuild: pwaMat,
        buildSeen,
        lancamentoHintAtMs: hintAt || null,
        appDataKb,
        mobileTraceEnabled: localStorage.getItem("hb.coop.mobile.trace") === "1",
      },
      appDataFinanceRough: financeRough,
      snapshots: readSnaps(cooperadoId),
      hbCoopLocalStorage: scanStorage("hb.coop"),
      syncTraceRing: traceRing.slice(-25),
      serviceWorker: sw,
      appBuiltInDiag: builtInFresh || builtIn,
      causasProvaveis: causas,
      proximoPasso: "Copie: await __HB_COOPERADO_DIAG_COPY__() e cole no chat.",
    };

    window.__HB_COOPERADO_DIAG_LAST__ = report;
    return report;
  }

  async function run() {
    const report = await buildReport();
    console.info("%c[HB] Diagnóstico cooperado (completo)", "font-weight:bold;color:#166534");
    console.table({
      cloud: report.release.nuvem?.build ?? "—",
      page: report.release.pageBuild,
      operSync: report.storage.operacionalSyncedBuild,
      buildSeen: report.storage.buildSeen,
      appDataKb: report.storage.appDataKb,
      pendente: report.appDataFinanceRough?.pendenteSoma ?? "—",
      causas: report.causasProvaveis[0],
    });
    console.log(report);
    return report;
  }

  async function copyJson() {
    const report = window.__HB_COOPERADO_DIAG_LAST__ || await buildReport();
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      console.info("[HB] JSON copiado para a área de transferência (" + text.length + " chars)");
    } catch {
      console.warn("[HB] Não foi possível copiar — use o objeto acima");
      console.log(text);
    }
    return text;
  }

  window.__HB_COOPERADO_DIAG_RUN__ = run;
  window.__HB_COOPERADO_DIAG_COPY__ = copyJson;

  console.info(
    "[HB] Cooperado diag pronto. Rode:\n  await __HB_COOPERADO_DIAG_RUN__()\n  await __HB_COOPERADO_DIAG_COPY__()"
  );
})();
