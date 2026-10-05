/**
 * HB · Verificação CONFERÊNCIA — aprovar / Aprovar e próxima (produção)
 *
 * COMO USAR
 * 1. https://hbcooperativas.vercel.app — login responsável (perfil duplo → «Abrir painel responsável»)
 * 2. Aba Conferir → /notas-pedido → abra uma entrega (modal «Conferir entrega»)
 * 3. F12 → Console → cole este arquivo → Enter (monitor fica ativo)
 * 4. Abra uma entrega na fila (modal «Conferir entrega»)
 * 5. Rode HB_CONFERENCIA_REVER() — tabela C05–C08 com modal aberto
 * 6. Toque Aprovar → HB_CONFERENCIA_REVER() de novo (C08 deve ser 201)
 *
 * Build mínimo recomendado: 132 (sync em background não trava botão no modal)
 * Relacionado: 131 skip bulk cooperados · 130 fast-path operacional
 */
(function hbVerificarConferenciaAprovacaoProducao() {
  "use strict";

  var MIN_BUILD = 132;
  var MIN_BUILD_SYNC = 131;
  var MIN_BUILD_OPER = 130;

  function elAttr(name) {
    try {
      return document.documentElement.getAttribute(name);
    } catch (e) {
      return null;
    }
  }

  function textoPagina() {
    try {
      return (document.body && document.body.innerText) || "";
    } catch (e) {
      return "";
    }
  }

  function isStaffSession() {
    var t = textoPagina();
    if (t.indexOf("Modo cooperado") >= 0 && t.indexOf("Modo responsável") < 0) return false;
    if (t.indexOf("Modo responsável") >= 0) return true;
    var nav = textoPagina();
    return nav.indexOf("Conferir entregas") >= 0 || (nav.indexOf("Conferir") >= 0 && nav.indexOf("Minhas entregas") < 0);
  }

  function modalConferenciaRoot() {
    try {
      var headings = document.querySelectorAll("h2");
      for (var i = 0; i < headings.length; i++) {
        var ht = (headings[i].textContent || "").replace(/\s+/g, " ").trim();
        if (ht.indexOf("Conferir entrega") === 0) {
          var panel = headings[i].closest("div.relative.bg-white");
          if (panel) return panel;
          var p = headings[i].parentElement;
          for (var d = 0; d < 4 && p; d++) {
            if (p.querySelector && p.querySelector("button")) return p;
            p = p.parentElement;
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function modalConferenciaAberto() {
    return Boolean(modalConferenciaRoot()) || /Conferir entrega \(\d+ de \d+\)/.test(textoPagina());
  }

  function rodapeAprovarPresente() {
    var t = textoPagina();
    return t.indexOf("Pedir correção") >= 0;
  }

  function rotuloBotao(b) {
    var parts = [];
    if (b.getAttribute("aria-label")) parts.push(b.getAttribute("aria-label"));
    parts.push((b.textContent || "").replace(/\s+/g, " ").trim());
    return parts.filter(Boolean).join(" · ");
  }

  function botaoAprovar() {
    var root = modalConferenciaRoot();
    var buttons = root ? root.querySelectorAll("button") : document.querySelectorAll("button");
    var candidatos = [];
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var label = rotuloBotao(b).toLowerCase();
      if (label.indexOf("pedir correção") >= 0 || label.indexOf("correção") >= 0 && label.indexOf("pedir") >= 0) continue;
      if (
        label.indexOf("aprovar") >= 0 ||
        label.indexOf("concluir entrega") >= 0 ||
        label.indexOf("lançar foto") >= 0 ||
        label.indexOf("lancar foto") >= 0 ||
        label.indexOf("próxima foto") >= 0 ||
        label.indexOf("proxima foto") >= 0 ||
        label.indexOf("continuar") >= 0 && label.indexOf("foto") >= 0
      ) {
        candidatos.push(b);
      }
    }
    if (candidatos.length === 0) return null;
    for (var j = 0; j < candidatos.length; j++) {
      if (candidatos[j].className && String(candidatos[j].className).indexOf("bg-green") >= 0) return candidatos[j];
    }
    return candidatos[candidatos.length - 1];
  }

  function motivoBotaoDesabilitado(btn) {
    if (!btn) {
      if (modalConferenciaAberto() && !rodapeAprovarPresente()) {
        return [
          "rodapé de aprovação ausente — nota não está aguardando_conferencia ou sem permissão notas_pedido/approve",
        ];
      }
      return ["botão não encontrado — role no modal ou texto diferente (ex.: só ícone)"];
    }
    var motivos = [];
    if (btn.disabled) motivos.push("HTML disabled=true");
    var h = textoPagina();
    if (h.indexOf("Carregando próxima entrega") >= 0) motivos.push("conferenciaTransicao (overlay)");
    if (/Lançando foto \d+ de \d+/.test(h)) motivos.push("lancamentoSequencia (slideshow)");
    if (h.indexOf("Sincronizando") >= 0 || h.indexOf("Atualizando") >= 0) {
      motivos.push("possível sync na UI — build ≥132 não deve bloquear aprovar COM modal aberto");
    }
    if (motivos.length === 0 && !btn.disabled) motivos.push("botão habilitado (OK para clicar)");
    return motivos;
  }

  function parseBuildFromDom() {
    var raw = elAttr("data-hb-app-build") || elAttr("data-app-build");
    if (raw) {
      var n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
    var m = textoPagina().match(/\bv(\d{3,4})\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function fetchBuildRelease() {
    return fetch("/api/client-release", { credentials: "include" })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        return j && (j.build != null ? j.build : j.appBuildVersion);
      })
      .catch(function () {
        return null;
      });
  }

  function instalarMonitorSync() {
    if (window.__HB_CONFERENCIA_FETCH_PATCH__) return;
    window.__HB_CONFERENCIA_FETCH_PATCH__ = true;
    window.__HB_CONFERENCIA_SYNC_LOG__ = [];
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : "";
      var started = Date.now();
      return orig(input, init).then(function (res) {
        if (url.indexOf("cooperativa-sync") >= 0 || url.indexOf("notas-pedido") >= 0) {
          var entry = {
            t: new Date().toISOString(),
            ms: Date.now() - started,
            url: url.split("?")[0],
            status: res.status,
            method: (init && init.method) || "GET",
            code: null,
            error: null,
          };
          window.__HB_CONFERENCIA_SYNC_LOG__.push(entry);
          if (window.__HB_CONFERENCIA_SYNC_LOG__.length > 40) {
            window.__HB_CONFERENCIA_SYNC_LOG__.shift();
          }
          if (res.status >= 400 && url.indexOf("cooperativa-sync") >= 0) {
            res
              .clone()
              .json()
              .then(function (j) {
                entry.code = j && j.code ? j.code : null;
                entry.error = j && j.error ? j.error : null;
              })
              .catch(function () {});
          }
        }
        return res;
      });
    };
  }

  function checksEstaticos(buildDom, buildApi) {
    var build = buildApi != null ? buildApi : buildDom;
    var rows = [];

    rows.push({
      id: "C01",
      titulo: "Build deploy (mín. " + MIN_BUILD + ")",
      st: build != null && build >= MIN_BUILD ? "ok" : build != null && build >= MIN_BUILD_SYNC ? "aviso" : "falha",
      msg:
        build == null
          ? "Não leu build — confira /api/client-release"
          : build >= MIN_BUILD
            ? "build " + build + " (fix botão aprovar com sync em fila)"
            : build >= MIN_BUILD_SYNC
              ? "build " + build + " — falta ≥132: botão pode ficar morto durante sync"
              : "build " + build + " antigo — atualize PWA",
    });

    rows.push({
      id: "C02",
      titulo: "Fast-path operacional (≥" + MIN_BUILD_OPER + ")",
      st: build != null && build >= MIN_BUILD_OPER ? "ok" : "falha",
      msg: build != null && build >= MIN_BUILD_OPER ? "POST operacional sem reload HB desnecessário" : "Risco timeout 500 ao sync",
    });

    rows.push({
      id: "C03",
      titulo: "Sessão responsável / staff",
      st: isStaffSession() ? "ok" : "falha",
      msg: isStaffSession()
        ? "Perfil staff detectado"
        : "Login como responsável ou «Abrir painel responsável»",
    });

    rows.push({
      id: "C04",
      titulo: "Rota /notas-pedido",
      st: (location.pathname || "").indexOf("notas-pedido") >= 0 ? "ok" : "aviso",
      msg: "pathname: " + (location.pathname || "/"),
    });

    var modalAberto = modalConferenciaAberto();
    rows.push({
      id: "C05",
      titulo: "Modal «Conferir entrega» aberto",
      st: modalAberto ? "ok" : "pular",
      msg: modalAberto
        ? "Modal detectado — C06 vale agora"
        : "Normal com modal fechado — abra uma entrega e rode HB_CONFERENCIA_REVER()",
    });

    var btn = botaoAprovar();
    var motivos = motivoBotaoDesabilitado(btn);
    rows.push({
      id: "C06",
      titulo: "Botão aprovar / próxima",
      st: !modalAberto ? "pular" : btn && !btn.disabled ? "ok" : btn && btn.disabled ? "falha" : "aviso",
      msg: !modalAberto
        ? "Rode HB_CONFERENCIA_REVER() com modal aberto"
        : btn
          ? rotuloBotao(btn) + " · " + motivos.join("; ")
          : motivos[0],
    });

    rows.push({
      id: "C07",
      titulo: "Monitor fetch sync (instalado)",
      st: window.__HB_CONFERENCIA_FETCH_PATCH__ ? "ok" : "aviso",
      msg: "Log em window.__HB_CONFERENCIA_SYNC_LOG__",
    });

    var log = window.__HB_CONFERENCIA_SYNC_LOG__ || [];
    var lastPost = null;
    for (var li = log.length - 1; li >= 0; li--) {
      if (log[li].method === "POST" && log[li].url.indexOf("cooperativa-sync") >= 0) {
        lastPost = log[li];
        break;
      }
    }
    var buildOk132 = build != null && build >= MIN_BUILD;
    rows.push({
      id: "C08",
      titulo: "Último POST cooperativa-sync",
      st: !lastPost ? "pular" : lastPost.status === 201 ? "ok" : lastPost.status === 500 ? "falha" : "aviso",
      msg: lastPost
        ? lastPost.status +
          " · " +
          lastPost.ms +
          "ms" +
          (lastPost.code ? " · " + lastPost.code : "") +
          (lastPost.error ? " · " + String(lastPost.error).slice(0, 80) : "")
        : buildOk132
          ? "Nenhum POST ainda — aprove uma nota e rode HB_CONFERENCIA_REVER()"
          : "Atualize para build ≥132 antes de testar aprovação",
    });

    return rows;
  }

  function rever() {
    var store = window.__HB_VERIFICACAO_CONFERENCIA__ || {};
    var buildApi = store.buildApi != null ? store.buildApi : null;
    var checks = checksEstaticos(parseBuildFromDom(), buildApi);
    var btn = botaoAprovar();
    var rel = {
      quando: new Date().toISOString(),
      pathname: location.pathname,
      buildApi: buildApi,
      modalAberto: modalConferenciaAberto(),
      rodapePedirCorrecao: rodapeAprovarPresente(),
      botao: btn
        ? {
            texto: rotuloBotao(btn),
            disabled: btn.disabled,
            motivos: motivoBotaoDesabilitado(btn),
          }
        : null,
      syncLog: (window.__HB_CONFERENCIA_SYNC_LOG__ || []).slice(-8),
    };
    console.group("HB · Conferência — HB_CONFERENCIA_REVER()");
    console.table(checks);
    console.log(rel);
    console.groupEnd();
    if (store.checks !== undefined) {
      store.checks = checks;
      store.ultimaRever = rel.quando;
    }
    return rel;
  }

  instalarMonitorSync();

  var relatorio = {
    versaoScript: "conferencia-aprovacao-2026-10-05",
    minBuild: MIN_BUILD,
    pathname: location.pathname,
    buildDom: parseBuildFromDom(),
    checks: [],
    interpretacao: [
      "C01 ok = deploy 132+ — ambiente pronto.",
      "C05/C06/C08 «pular» = normal se modal fechado; abra Conferir e use HB_CONFERENCIA_REVER().",
      "Com modal: C06 ok + C08 = 201 após aprovar. C08 falha 500 → Network → Response (code/error).",
    ],
    rever: "HB_CONFERENCIA_REVER()",
  };

  fetchBuildRelease().then(function (buildApi) {
    relatorio.buildApi = buildApi;
    relatorio.checks = checksEstaticos(relatorio.buildDom, buildApi);

    try {
      window.__HB_VERIFICACAO_CONFERENCIA__ = relatorio;
      window.HB_CONFERENCIA_REVER = rever;
    } catch (e) {
      /* ignore */
    }

    console.group("HB · Verificação conferência — aprovar / próxima");
    console.table(relatorio.checks);
    console.warn(relatorio.interpretacao.join("\n"));
    console.log("Detalhe → window.__HB_VERIFICACAO_CONFERENCIA__");
    console.log("Com modal aberto → HB_CONFERENCIA_REVER()  ·  após Aprovar → HB_CONFERENCIA_REVER() de novo");
    console.groupEnd();
  });
})();
