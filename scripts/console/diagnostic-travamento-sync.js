/**
 * Diagnóstico F12 — lentidão / travamento + POST cooperativa-sync 500
 * Cole no Console (responsável logado). Retorna objeto (não só Promise).
 */
(async function hbDiagnosticTravamentoSync() {
  "use strict";
  var LIMITE_OPER_MB = 5;

  function blobSize(obj) {
    try {
      return new Blob([JSON.stringify(obj)]).size;
    } catch (e) {
      return 0;
    }
  }

  function normalizeCnpj(v) {
    return String(v || "").replace(/\D/g, "");
  }

  function readSession() {
    try {
      var raw = localStorage.getItem("coopeagriplla_session");
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  var session = readSession();
  var CNPJ = normalizeCnpj(session.cooperativaCnpj);
  var role = session.role || "";
  var staffGestao =
    role === "responsavel" || role === "tesoureiro" || role === "admin";

  var chavePersist =
    staffGestao && CNPJ.length === 14
      ? "coopeagriplla_data:" + CNPJ
      : "coopeagriplla_data";

  var localRaw = null;
  try {
    localRaw = localStorage.getItem(chavePersist);
  } catch (e) {
    /* ignore */
  }

  var chavesHb = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("coopeagriplla_data") === 0) {
        var v = localStorage.getItem(k);
        chavesHb.push({
          chave: k,
          mb: ((v ? new Blob([v]).size : 0) / (1024 * 1024)).toFixed(2),
        });
      }
    }
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
    if (CNPJ.length === 14) {
      coop = local.cooperativas.find(function (c) {
        return normalizeCnpj(c.cnpj) === CNPJ;
      });
    }
    if (!coop) coop = local.cooperativas[0];
  }
  var coopId = coop && coop.id;

  var slice = { notas: 0, fichas: 0, pagamentos: 0 };
  if (local && coopId) {
    slice.notas = (local.notasPedido || []).filter(function (n) {
      return n.cooperativaId === coopId;
    }).length;
    slice.fichas = (local.fichaCorrida || []).filter(function (f) {
      return f.cooperativaId === coopId;
    }).length;
    slice.pagamentos = (local.pagamentosCooperado || []).filter(function (p) {
      return p.cooperativaId === coopId;
    }).length;
  } else if (local) {
    slice.notas = (local.notasPedido || []).length;
    slice.fichas = (local.fichaCorrida || []).length;
    slice.pagamentos = (local.pagamentosCooperado || []).length;
  }

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
  var cnpjCloud = CNPJ.length === 14 ? CNPJ : "62351750000165";
  try {
    var g = await fetch("/api/cooperativa-sync?cnpj=" + cnpjCloud, { credentials: "include" });
    var gj = await g.json();
    cloudOperacional = {
      http: g.status,
      ok: g.ok,
      cnpjConsultado: cnpjCloud,
      hasOperacional: !!gj.operacional,
      updatedAt: gj.operacional && gj.operacional.updatedAt,
      fullReset: gj.operacional && gj.operacional.fullReset,
      code: gj.code,
      error: gj.error,
    };
  } catch (e) {
    cloudOperacional = { erro: String(e) };
  }

  var syncPosts = [];
  try {
    syncPosts = performance
      .getEntriesByType("resource")
      .filter(function (e) {
        return e.name.indexOf("/api/cooperativa-sync") >= 0;
      })
      .slice(-8)
      .map(function (e) {
        return {
          ms: Math.round(e.duration),
          kb: Math.round((e.transferSize || 0) / 1024),
          metodo: e.name.indexOf("?") >= 0 ? "GET" : "POST",
          name: e.name.slice(0, 96),
        };
      });
  } catch (e) {
    /* ignore */
  }

  var relatorio = {
    quando: new Date().toISOString(),
    rota: location.pathname,
    role: role,
    build: apiRelease && apiRelease.build,
    chavePersistLida: chavePersist,
    cnpjSessao: CNPJ || "(vazio)",
    chavesCoopeagripllaData: chavesHb,
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
    interpretacao: [],
  };

  if (!CNPJ || CNPJ.length !== 14) {
    relatorio.interpretacao.push(
      "ATENÇÃO: sessão sem cooperativaCnpj — gestão pode estar sem arquivo local isolado."
    );
  }

  if (staffGestao && localBytes < 500 && chavesHb.some(function (x) { return parseFloat(x.mb) > 0.5; })) {
    relatorio.interpretacao.push(
      "INFO: dados provavelmente em coopeagriplla_data:CNPJ (script agora lê a chave certa)."
    );
  }

  if (apiRelease && apiRelease.build < 657) {
    relatorio.interpretacao.push(
      "ATUALIZE: build " + apiRelease.build + " — em produção o alvo é ≥657 (Ctrl+F5 ou janela anônima)."
    );
  }

  if (estOperacionalBytes > LIMITE_OPER_MB * 1024 * 1024) {
    relatorio.interpretacao.push(
      "CRÍTICO: operacional local > " + LIMITE_OPER_MB + " MB — risco de POST 500 e travamento."
    );
  } else if (relatorio.operacionalEstimado.proximoDoLimite) {
    relatorio.interpretacao.push(
      "ATENÇÃO: operacional local perto de " + LIMITE_OPER_MB + " MB."
    );
  }

  if (localBytes < 1000 && cloudOperacional && cloudOperacional.hasOperacional) {
    relatorio.interpretacao.push(
      "LOCAL VAZIO + NUVEM OK: use «Atualizar» no painel após abrir com build ≥657; evite F5 em loop."
    );
  }

  relatorio.interpretacao.push(
    "POST cooperativa-sync com 500 → aba Network → Response (payload grande, lock 423, etc.)."
  );

  try {
    window.__HB_DIAG_SYNC__ = relatorio;
  } catch (e) {
    /* ignore */
  }

  console.group("HB · Diagnóstico travamento / sync");
  console.log("Chave lida:", chavePersist, "| CNPJ sessão:", CNPJ || "(vazio)");
  console.table(relatorio.localStorage);
  console.log("Todas chaves coopeagriplla_data:", chavesHb);
  console.log("Build:", relatorio.build);
  console.log("GET nuvem:", relatorio.cloudGet);
  console.log("Últimos fetch sync:", relatorio.ultimosFetchSync);
  console.warn(relatorio.interpretacao.join("\n"));
  console.log("Copiar: copy(window.__HB_DIAG_SYNC__)");
  console.groupEnd();

  return relatorio;
})().catch(function (e) {
  console.error("diag sync falhou", e);
});
