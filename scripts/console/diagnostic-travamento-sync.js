/**
 * Diagnóstico F12 — lentidão / travamento + POST cooperativa-sync 500
 * Cole no console em /notas-pedido (modo responsável), logo após ver [operacional-push] 500
 */
(async function hbDiagnosticTravamentoSync() {
  "use strict";
  var LIMITE_OPER_MB = 5;
  var CNPJ = "62351750000165";

  function blobSize(obj) {
    try {
      return new Blob([JSON.stringify(obj)]).size;
    } catch (e) {
      return 0;
    }
  }

  var localRaw = null;
  try {
    localRaw = localStorage.getItem("coopeagriplla_data");
  } catch (e) {
    /* ignore */
  }

  var local = null;
  var localBytes = localRaw ? new Blob([localRaw]).size : 0;
  try {
    local = localRaw ? JSON.parse(localRaw) : null;
  } catch (e) {
    local = null;
  }

  var coop = null;
  if (local && local.cooperativas && local.cooperativas.length) {
    coop = local.cooperativas.find(function (c) {
      return String(c.cnpj || "").replace(/\D/g, "") === CNPJ;
    });
  }
  var coopId = coop && coop.id;

  var slice = {
    notas: (local && local.notasPedido) ? local.notasPedido.length : 0,
    fichas: (local && local.fichaCorrida) ? local.fichaCorrida.length : 0,
    pagamentos: (local && local.pagamentosCooperado) ? local.pagamentosCooperado.length : 0,
  };

  var estOperacionalBytes = 0;
  if (local && coopId) {
    estOperacionalBytes = blobSize({
      fichaCorrida: (local.fichaCorrida || []).filter(function (f) {
        return f.cooperativaId === coopId;
      }),
      pagamentosCooperado: (local.pagamentosCooperado || []).filter(function (p) {
        return p.cooperativaId === coopId;
      }),
      mensalidades: local.mensalidades || [],
      votacaoPautas: local.votacaoPautas || [],
      votacaoVotos: local.votacaoVotos || [],
    });
  }

  var apiRelease = null;
  try {
    var r = await fetch("/api/client-release", { cache: "no-store" });
    apiRelease = r.ok ? await r.json() : { erro: r.status };
  } catch (e) {
    apiRelease = { erro: String(e) };
  }

  var cloudOperacional = null;
  try {
    var g = await fetch("/api/cooperativa-sync?cnpj=" + CNPJ, { credentials: "include" });
    var gj = await g.json();
    cloudOperacional = {
      http: g.status,
      ok: g.ok,
      hasOperacional: !!gj.operacional,
      updatedAt: gj.operacional && gj.operacional.updatedAt,
      fullReset: gj.operacional && gj.operacional.fullReset,
      code: gj.code,
      error: gj.error,
    };
  } catch (e) {
    cloudOperacional = { erro: String(e) };
  }

  var longTasks = [];
  try {
    longTasks = performance
      .getEntriesByType("longtask")
      .slice(-8)
      .map(function (e) {
        return Math.round(e.duration) + "ms";
      });
  } catch (e) {
    /* ignore */
  }

  var syncPosts = [];
  try {
    syncPosts = performance
      .getEntriesByType("resource")
      .filter(function (e) {
        return e.name.indexOf("/api/cooperativa-sync") >= 0 && e.initiatorType === "fetch";
      })
      .slice(-5)
      .map(function (e) {
        return {
          ms: Math.round(e.duration),
          kb: Math.round((e.transferSize || 0) / 1024),
          name: e.name.slice(0, 80),
        };
      });
  } catch (e) {
    /* ignore */
  }

  var relatorio = {
    quando: new Date().toISOString(),
    rota: location.pathname,
    build: apiRelease && apiRelease.build,
    localStorage: {
      mb: (localBytes / (1024 * 1024)).toFixed(2),
      notas: slice.notas,
      fichas: slice.fichas,
      pagamentos: slice.pagamentos,
    },
    operacionalEstimado: {
      mb: (estOperacionalBytes / (1024 * 1024)).toFixed(2),
      limiteMb: LIMITE_OPER_MB,
      proximoDoLimite: estOperacionalBytes >= LIMITE_OPER_MB * 1024 * 1024 * 0.85,
    },
    cloudGet: cloudOperacional,
    ultimosFetchSync: syncPosts,
    longTasksRecentes: longTasks,
    interpretacao: [],
  };

  if (estOperacionalBytes > LIMITE_OPER_MB * 1024 * 1024) {
    relatorio.interpretacao.push(
      "CRÍTICO: operacional estimado > " +
        LIMITE_OPER_MB +
        " MB — upload Supabase falha (500) e trava o fluxo."
    );
  } else if (relatorio.operacionalEstimado.proximoDoLimite) {
    relatorio.interpretacao.push(
      "ATENÇÃO: operacional perto de " + LIMITE_OPER_MB + " MB — risco de 500 ao enviar nota."
    );
  }

  relatorio.interpretacao.push(
    "[operacional-push] 500 = falha ao gravar operacional.json na nuvem (não é bug do script de verificação)."
  );
  relatorio.interpretacao.push(
    "Network → POST cooperativa-sync → aba Response: leia error e code (ex.: payload grande, restore lock 423)."
  );
  relatorio.interpretacao.push(
    "Enviar nota dispara pushOperacionalToCloud (vários GET + merge + POST) — UI pode travar alguns segundos."
  );

  try {
    window.__HB_DIAG_SYNC__ = relatorio;
  } catch (e) {
    /* ignore */
  }

  console.group("HB · Diagnóstico travamento / sync 500");
  console.table(relatorio.localStorage);
  console.log("Operacional estimado (MB):", relatorio.operacionalEstimado);
  console.log("GET nuvem:", relatorio.cloudGet);
  console.log("Últimos fetch sync:", relatorio.ultimosFetchSync);
  console.warn(relatorio.interpretacao.join("\n"));
  console.log("Detalhe → window.__HB_DIAG_SYNC__");
  console.groupEnd();

  return relatorio;
})().catch(function (e) {
  console.error("diag sync falhou", e);
});
