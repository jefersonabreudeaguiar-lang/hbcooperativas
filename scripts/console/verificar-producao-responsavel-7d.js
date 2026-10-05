/**
 * HB Cooperativas — verificação PRODUÇÃO · área RESPONSÁVEL (~7 dias)
 *
 * COMO USAR
 * 1. https://hbcooperativas.vercel.app — login responsável/tesoureiro/admin
 *    (perfil duplo: toque «Abrir painel responsável» antes de rodar)
 * 2. Mobile: largura < 1024px (celular ou DevTools responsivo)
 * 3. F12 → Console → cole este arquivo inteiro → Enter
 * 4. Resultado: tabela + window.__HB_VERIFICACAO_RESP_7D__
 *
 * Opcional: abra /notas-pedido e /ficha-corrida antes de rodar (checks 15–16).
 *
 * Releases ~7 dias cobertos (build mínimo 119; split staff 126+):
 * - Lazy routes + perf conferência (fila responsável, modais/fotos lazy)
 * - Versão do app na faixa staff / chip de sync
 * - Split NotasPedidoStaffMain vs cooperado (126)
 * - Fixes jank/multi-foto/sync fila (sem keep-alive cooperado no staff)
 */
(async function hbVerificarProducaoResponsavel7d() {
  "use strict";

  var MIN_BUILD_STAFF_7D = 119;
  var MIN_BUILD_NOTAS_SPLIT = 126;
  var BUILD_SHELL_DIAG = 129;
  var BLOCKED_DPL = ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"];
  var STAFF_TAB_HREFS = ["/notas-pedido", "/ficha-corrida", "/livro-caixa"];

  function elAttr(name) {
    try {
      return document.documentElement.getAttribute(name);
    } catch (e) {
      return null;
    }
  }

  function isMobileViewport() {
    try {
      return window.matchMedia("(max-width: 1023px)").matches;
    } catch (e) {
      return window.innerWidth < 1024;
    }
  }

  function isLoginRoute() {
    var p = location.pathname || "";
    return p === "/login" || p.indexOf("login") >= 0 || p.indexOf("redefinir-senha") >= 0;
  }

  function collectLoadedDpls() {
    var ids = [];
    var seen = {};
    try {
      document
        .querySelectorAll('script[src*="dpl="], link[href*="dpl="]')
        .forEach(function (node) {
          var url = node.src || node.href || "";
          var m = url.match(/[?&]dpl=([^&]+)/);
          if (m && m[1] && !seen[m[1]]) {
            seen[m[1]] = 1;
            ids.push(m[1]);
          }
        });
    } catch (e) {
      /* ignore */
    }
    return ids;
  }

  function linksFromNav(nav) {
    var row = [];
    if (!nav) return row;
    var links = nav.querySelectorAll('a[href^="/"]');
    for (var j = 0; j < links.length; j++) {
      var a = links[j];
      row.push({
        href: (a.getAttribute("href") || "").split("?")[0],
        label: (a.textContent || "").replace(/\s+/g, " ").trim(),
      });
    }
    return row;
  }

  function bottomNavItems() {
    try {
      var fixedBars = document.querySelectorAll("div.fixed.bottom-0, div[class*='bottom-0'][class*='fixed']");
      for (var i = 0; i < fixedBars.length; i++) {
        var bar = fixedBars[i];
        if (bar.closest(".w-72") || bar.closest("[class*='w-72']")) continue;
        var nav = bar.querySelector("nav");
        var row = linksFromNav(nav);
        if (row.length >= 4 && row.length <= 12) return row;
      }
      var rodapeNav =
        document.querySelector("nav.border-t-2.border-green-200") ||
        document.querySelector("nav.flex.bg-white.border-t-2");
      var fallback = linksFromNav(rodapeNav);
      if (fallback.length >= 4) return fallback;
    } catch (e) {
      /* ignore */
    }
    return [];
  }

  function hasCooperadoNav(items) {
    var labels = items.map(function (x) {
      return x.label;
    });
    return labels.indexOf("Entregas") >= 0 && labels.indexOf("Mensalidades") >= 0;
  }

  function hasStaffMobileNav(items) {
    var labels = items.map(function (x) {
      return x.label;
    });
    return labels.indexOf("Conferir") >= 0 && labels.indexOf("Pagar") >= 0;
  }

  function parseKeepAliveState(raw) {
    if (!raw) return null;
    var m = /^e(\d)m(\d)t(\d)p(\d):(.+)$/.exec(raw);
    if (!m) return { raw: raw };
    return {
      enabled: m[1] === "1",
      mobile: m[2] === "1",
      onTab: m[3] === "1",
      panelCount: parseInt(m[4], 10),
      path: m[5],
      raw: raw,
    };
  }

  function detectSessao() {
    var mobile = isMobileViewport();
    var loggedIn = !isLoginRoute();
    var shell = elAttr("data-hb-shell-mode");
    var wrap = elAttr("data-hb-keep-alive-wrap");
    var nav = bottomNavItems();
    var bodyText = "";
    try {
      bodyText = document.body ? document.body.innerText : "";
    } catch (e) {
      bodyText = "";
    }
    var dualPainel =
      bodyText.indexOf("Modo responsável") >= 0 ||
      bodyText.indexOf("Modo cooperado") >= 0 ||
      bodyText.indexOf("Abrir painel responsável") >= 0 ||
      bodyText.indexOf("Ver como cooperado") >= 0;

    var modoStaffTexto = bodyText.indexOf("Modo responsável") >= 0;
    var modoCoopTexto =
      bodyText.indexOf("Modo cooperado") >= 0 && bodyText.indexOf("Modo responsável") < 0;

    var cooperadoNav = hasCooperadoNav(nav);
    var staffNav = hasStaffMobileNav(nav);
    var greenCoopBar = !!document.querySelector(
      ".border-green-100.bg-green-50\\/95, .border-t.border-green-100"
    );
    var indigoStaffBar = !!document.querySelector(
      ".border-indigo-100.bg-indigo-50\\/95"
    );

    var modo = "desconhecido";
    if (!loggedIn) modo = "nao_logado";
    else if (
      shell === "responsavel" ||
      shell === "tesoureiro" ||
      shell === "admin"
    ) {
      modo = "responsavel_mobile";
    } else if (modoStaffTexto || (staffNav && !cooperadoNav)) {
      modo = "responsavel_mobile";
    } else if (modoCoopTexto || (cooperadoNav && !staffNav)) {
      modo = "cooperado_mobile";
    } else if (indigoStaffBar && staffNav) modo = "responsavel_mobile";
    else if (loggedIn) modo = "logado_outro";

    return {
      mobile: mobile,
      loggedIn: loggedIn,
      pathname: location.pathname.split("?")[0],
      shell: shell,
      keepAliveWrap: wrap,
      modo: modo,
      dualPainel: dualPainel,
      nav: nav,
      greenCoopBar: greenCoopBar,
      indigoStaffBar: indigoStaffBar,
      modoStaffTexto: modoStaffTexto,
    };
  }

  function perfilOk(necessario, sessao) {
    if (necessario === "qualquer") return { ok: true };
    if (necessario === "logado" && !sessao.loggedIn) {
      return { ok: false, pular: true, dica: "Entre no app (não fique na tela de login)." };
    }
    if (necessario === "mobile" && !sessao.mobile) {
      return {
        ok: false,
        pular: true,
        dica: "Use largura < 1024px (modo responsivo) — rodapé Conferir/Pagar.",
      };
    }
    if (necessario === "responsavel_mobile") {
      if (!sessao.loggedIn) {
        return { ok: false, pular: true, dica: "Login responsável/tesoureiro/admin." };
      }
      if (!sessao.mobile) {
        return { ok: false, pular: true, dica: "Viewport mobile (< 1024px)." };
      }
      if (sessao.modo === "cooperado_mobile") {
        return {
          ok: false,
          pular: true,
          dica: "Você está como cooperado. Toque «Abrir painel responsável» e rode de novo.",
        };
      }
      if (sessao.modo !== "responsavel_mobile") {
        var dica =
          "Shell responsável não detectado (modo=" +
          sessao.modo +
          "). Rodapé deve ter Conferir + Pagar.";
        if (sessao.dualPainel) dica += " Perfil duplo: use «Abrir painel responsável».";
        return { ok: false, pular: true, dica: dica };
      }
    }
    if (necessario === "responsavel_rota") {
      var g = perfilOk("responsavel_mobile", sessao);
      if (g.pular) return g;
    }
    return { ok: true };
  }

  function statusIcon(st) {
    if (st === "ok") return "OK";
    if (st === "falha") return "FALHA";
    if (st === "aviso") return "AVISO";
    return "PULAR";
  }

  function findBuildLabel(build) {
    var want = build ? "v" + build : "v";
    var texts = [];
    try {
      document.querySelectorAll('[role="status"], [title*="app v"], .tabular-nums').forEach(function (el) {
        var t = (el.textContent || "") + " " + (el.getAttribute("title") || "");
        if (t.indexOf("app v") >= 0 || t.indexOf(want) >= 0) texts.push(t.replace(/\s+/g, " ").trim());
      });
    } catch (e) {
      /* ignore */
    }
    var body = "";
    try {
      body = document.body.innerText || "";
    } catch (e2) {
      body = "";
    }
    var re = build ? new RegExp("app\\s+v" + build + "|\\bv" + build + "\\b") : /app\s+v\d+/;
    if (re.test(body)) texts.push("corpo da página contém " + want);
    return texts;
  }

  var api = { build: 0, deploymentId: "", gitCommitSha: "" };
  var apiErr = null;
  try {
    var res = await fetch("/api/client-release", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    api = await res.json();
  } catch (e) {
    apiErr = String(e && e.message ? e.message : e);
  }

  var htmlBuild = parseInt(elAttr("data-app-build") || "0", 10);
  var htmlDpl = (elAttr("data-dpl-id") || "").trim();
  var keepStateRaw = elAttr("data-hb-keep-alive-state");
  var keepParsed = parseKeepAliveState(keepStateRaw);
  var pageRelease = null;
  try {
    pageRelease = window.__HB_PAGE_RELEASE__ || null;
  } catch (e) {
    pageRelease = null;
  }

  var sessao = detectSessao();
  var build = api.build || htmlBuild || 0;
  var loadedDpls = collectLoadedDpls();
  var panels = 0;
  try {
    panels = document.querySelectorAll("[data-cooperado-tab-panel]").length;
  } catch (e) {
    panels = 0;
  }

  var checks = [];
  function addCheck(row) {
    checks.push(row);
  }

  addCheck({
    id: "R01_api_release",
    titulo: "API /api/client-release",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      if (apiErr) return { st: "falha", msg: apiErr };
      return {
        st: "ok",
        msg: "build " + build + " · sha " + (api.gitCommitSha || "").slice(0, 7),
      };
    },
  });

  addCheck({
    id: "R02_build_staff_7d",
    titulo: "Build mínimo staff/conferência (>=" + MIN_BUILD_STAFF_7D + ")",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      if (build < MIN_BUILD_STAFF_7D) {
        return { st: "falha", msg: "build " + build + " — deploy antigo para lazy/perf staff" };
      }
      var extra =
        build >= MIN_BUILD_NOTAS_SPLIT
          ? "Inclui split NotasPedidoStaffMain (126+)."
          : "Lazy routes ok; split staff/cooperado em 126+.";
      return { st: "ok", msg: "build " + build + ". " + extra };
    },
  });

  addCheck({
    id: "R03_dpl_alinhado",
    titulo: "HTML + chunks no mesmo deployment",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      var canon = (api.deploymentId || htmlDpl || "").trim();
      if (!canon) return { st: "aviso", msg: "dpl vazio" };
      var bad = loadedDpls.filter(function (id) {
        return id !== canon;
      });
      if (bad.length) return { st: "falha", msg: "dpl divergente: " + bad.join(", ") };
      return { st: "ok", msg: canon.slice(0, 18) + "… · " + loadedDpls.length + " chunk(s)" };
    },
  });

  addCheck({
    id: "R04_pwa_release",
    titulo: "PWA __HB_PAGE_RELEASE__ alinhado",
    perfil: "qualquer",
    minBuild: MIN_BUILD_STAFF_7D,
    run: function () {
      if (!pageRelease || !pageRelease.build) {
        return { st: "aviso", msg: "Recarregue a página (Ctrl+F5)" };
      }
      if (api.build && pageRelease.build !== api.build) {
        return { st: "falha", msg: "page " + pageRelease.build + " ≠ API " + api.build };
      }
      return { st: "ok", msg: "page build " + pageRelease.build };
    },
  });

  addCheck({
    id: "R05_sessao_responsavel",
    titulo: "Modo responsável detectado",
    perfil: "responsavel_mobile",
    minBuild: 0,
    run: function () {
      return {
        st: "ok",
        msg:
          "modo=" +
          sessao.modo +
          (sessao.modoStaffTexto ? " · barra «Modo responsável»" : "") +
          (sessao.dualPainel ? " · perfil duplo" : "") +
          " · nav=" +
          sessao.nav
            .slice(0, 6)
            .map(function (n) {
              return n.label;
            })
            .join("|"),
      };
    },
  });

  addCheck({
    id: "R06_rodape_conferir_pagar",
    titulo: "Rodapé mobile Conferir + Pagar (gestão)",
    perfil: "responsavel_mobile",
    minBuild: MIN_BUILD_STAFF_7D,
    run: function () {
      if (!hasStaffMobileNav(sessao.nav)) {
        return { st: "falha", msg: "Faltam abas Conferir/Pagar — nav: " + JSON.stringify(sessao.nav) };
      }
      if (hasCooperadoNav(sessao.nav)) {
        return { st: "falha", msg: "Rodapé cooperado (Entregas/Mensalidades) — troque para painel responsável" };
      }
      return { st: "ok", msg: "Conferir → /notas-pedido · Pagar → /ficha-corrida" };
    },
  });

  addCheck({
    id: "R07_versao_app_staff",
    titulo: "Versão do app visível (faixa índigo ou chip sync)",
    perfil: "responsavel_mobile",
    minBuild: MIN_BUILD_STAFF_7D,
    run: function () {
      var labels = findBuildLabel(build);
      if (sessao.indigoStaffBar) {
        if (build && labels.length === 0) {
          return { st: "aviso", msg: "Faixa staff ok; texto app v" + build + " não achado no DOM" };
        }
        return { st: "ok", msg: "faixa índigo staff · " + (labels[0] || "build " + build) };
      }
      if (sessao.dualPainel && sessao.greenCoopBar && build) {
        return {
          st: "ok",
          msg: "Perfil duplo: badge v" + build + " no rodapé verde (mesmo build staff)",
        };
      }
      var chip = document.querySelector('[role="status"][title*="app v"]');
      if (chip) return { st: "ok", msg: "chip sync: " + (chip.getAttribute("title") || chip.textContent) };
      return {
        st: "aviso",
        msg: "Faixa índigo ausente (comum em perfil duplo com cooperadoId) — confira badge v" + build,
      };
    },
  });

  addCheck({
    id: "R08_sem_keep_alive_cooperado",
    titulo: "Staff NÃO usa keep-alive de abas cooperado",
    perfil: "responsavel_mobile",
    minBuild: MIN_BUILD_NOTAS_SPLIT,
    run: function () {
      if (panels > 0) {
        if (sessao.dualPainel && build < BUILD_SHELL_DIAG) {
          return {
            st: "aviso",
            msg:
              panels +
              " painel(is) cooperado no DOM — perfil duplo em build " +
              build +
              " pode montar keep-alive; corrigido no 129+",
          };
        }
        return { st: "falha", msg: panels + " painéis data-cooperado-tab-panel (não esperado no staff)" };
      }
      if (keepParsed && keepParsed.enabled && keepParsed.panelCount > 0) {
        return { st: "falha", msg: "keep-alive ativo: " + keepStateRaw };
      }
      return { st: "ok", msg: "0 painéis cooperado · state " + (keepStateRaw || "null") };
    },
  });

  addCheck({
    id: "R09_shell_wrap_staff",
    titulo: "Shell DOM staff (wrap=0, build 129+)",
    perfil: "responsavel_mobile",
    minBuild: BUILD_SHELL_DIAG,
    run: function () {
      if (build < BUILD_SHELL_DIAG) {
        return { st: "aviso", msg: "Produção build " + build + " — check só após deploy 129" };
      }
      if (sessao.shell !== "responsavel" && sessao.shell !== "tesoureiro" && sessao.shell !== "admin") {
        return { st: "falha", msg: "data-hb-shell-mode=" + (sessao.shell || "null") };
      }
      if (sessao.keepAliveWrap !== "0") {
        return { st: "falha", msg: "data-hb-keep-alive-wrap=" + (sessao.keepAliveWrap || "null") + " (esperado 0)" };
      }
      return { st: "ok", msg: "shell=" + sessao.shell + " · wrap=0" };
    },
  });

  addCheck({
    id: "R10_pagina_conferir_entregas",
    titulo: "Tela Conferir entregas (/notas-pedido) — UI staff",
    perfil: "responsavel_rota",
    minBuild: MIN_BUILD_NOTAS_SPLIT,
    run: function () {
      if (sessao.pathname !== "/notas-pedido") {
        return {
          st: "aviso",
          msg: "Abra /notas-pedido (aba Conferir) e rode de novo — agora: " + sessao.pathname,
        };
      }
      var t = "";
      try {
        t = document.body.innerText || "";
      } catch (e) {
        t = "";
      }
      if (t.indexOf("Conferir entregas") < 0 && t.indexOf("conferência") < 0 && t.indexOf("conferencia") < 0) {
        return { st: "aviso", msg: "Página carregando ou título diferente — aguarde skeleton sumir" };
      }
      if (t.indexOf("Minhas entregas") >= 0 && t.indexOf("Conferir entregas") < 0) {
        return { st: "falha", msg: "UI cooperado (Minhas entregas) — papel efetivo não é staff" };
      }
      return { st: "ok", msg: "Notas staff carregada (split 126+)" };
    },
  });

  addCheck({
    id: "R11_pagina_pagar",
    titulo: "Tela Pagar cooperados (/ficha-corrida)",
    perfil: "responsavel_rota",
    minBuild: MIN_BUILD_STAFF_7D,
    run: function () {
      if (sessao.pathname !== "/ficha-corrida") {
        return {
          st: "aviso",
          msg: "Abra /ficha-corrida (aba Pagar) e rode de novo — agora: " + sessao.pathname,
        };
      }
      var t = document.body.innerText || "";
      if (t.indexOf("Pagar cooperados") >= 0 || t.indexOf("Ficha corrida") >= 0 || t.indexOf("cooperado") >= 0) {
        return { st: "ok", msg: "Ficha staff acessível" };
      }
      return { st: "aviso", msg: "Conteúdo ainda não renderizou — aguarde e repita" };
    },
  });

  addCheck({
    id: "R12_chunks_staff_notas",
    titulo: "Chunk staff de notas (lazy) carregado na rota",
    perfil: "responsavel_rota",
    minBuild: MIN_BUILD_NOTAS_SPLIT,
    run: function () {
      if (sessao.pathname !== "/notas-pedido") {
        return { st: "pular", msg: "Requer /notas-pedido" };
      }
      var hits = [];
      try {
        document.querySelectorAll("script[src]").forEach(function (s) {
          var u = s.src || "";
          if (/StaffMain|NotasPedidoStaff|notas-pedido.*Staff/i.test(u)) hits.push(u.split("/").pop());
        });
      } catch (e) {
        /* ignore */
      }
      if (hits.length) return { st: "ok", msg: "script staff: " + hits.slice(0, 2).join(", ") };
      return {
        st: "aviso",
        msg: "Nome do chunk minificado oculto — OK se R10 passou; confira Network ao abrir Conferir",
      };
    },
  });

  addCheck({
    id: "R13_rql_navegacao",
    titulo: "Marcas RQL após navegar (Conferir→Pagar→Início)",
    perfil: "responsavel_mobile",
    minBuild: 64,
    run: function () {
      var marks = [];
      try {
        marks = performance
          .getEntriesByType("mark")
          .map(function (e) {
            return e.name;
          })
          .filter(function (n) {
            return n.indexOf("rql:route:") === 0;
          });
      } catch (e) {
        return { st: "aviso", msg: "performance API indisponível" };
      }
      if (!marks.length) {
        return { st: "aviso", msg: "Navegue entre abas do rodapé e execute o script novamente" };
      }
      return { st: "ok", msg: marks.length + " transições · ex: " + marks.slice(-2).join(", ") };
    },
  });

  addCheck({
    id: "R14_sem_banner_update",
    titulo: "Sem banner «versão nova» preso",
    perfil: "logado",
    minBuild: 0,
    run: function () {
      var t = document.body && document.body.innerText.indexOf("Há uma versão nova do app") >= 0;
      if (t) return { st: "aviso", msg: "Atualize pelo banner antes de validar conferência" };
      return { st: "ok", msg: "ok" };
    },
  });

  addCheck({
    id: "R15_testes_manuais",
    titulo: "Checklist manual conferência (7 dias — não automatizável)",
    perfil: "responsavel_mobile",
    minBuild: MIN_BUILD_STAFF_7D,
    run: function () {
      return {
        st: "ok",
        msg:
          "Em /notas-pedido: abrir fila → Conferir → foto lazy → Lançar e continuar (multi-foto 1/N). " +
          "Rejeição/draft P2 e painel foto P3 só validam com entrega real na fila.",
      };
    },
  });

  var resultados = [];
  for (var c = 0; c < checks.length; c++) {
    var chk = checks[c];
    var gate = perfilOk(chk.perfil, sessao);
    var row = { id: chk.id, titulo: chk.titulo, perfil: chk.perfil, status: "PULAR", detalhe: "" };

    if (build && chk.minBuild && build < chk.minBuild) {
      row.status = "PULAR";
      row.detalhe = "Build " + build + " < " + chk.minBuild;
    } else if (gate.pular) {
      row.status = "PULAR";
      row.detalhe = gate.dica || "perfil";
    } else {
      try {
        var out = chk.run();
        if (out && typeof out.then === "function") out = await out;
        if (out.st === "pular") {
          row.status = "PULAR";
          row.detalhe = out.msg || "";
        } else {
          row.status = statusIcon(out.st);
          row.detalhe = out.msg || "";
        }
      } catch (err) {
        row.status = "FALHA";
        row.detalhe = String(err && err.message ? err.message : err);
      }
    }
    resultados.push(row);
  }

  var falhas = resultados.filter(function (r) {
    return r.status === "FALHA";
  });
  var avisos = resultados.filter(function (r) {
    return r.status === "AVISO";
  });
  var ok = resultados.filter(function (r) {
    return r.status === "OK";
  });

  var relatorio = {
    area: "responsavel",
    quando: new Date().toISOString(),
    url: location.href,
    innerWidth: window.innerWidth,
    mobile: sessao.mobile,
    sessao: sessao,
    release: { build: build, sha: (api.gitCommitSha || "").slice(0, 7), deploymentId: api.deploymentId || htmlDpl },
    resumo: {
      ok: ok.length,
      aviso: avisos.length,
      falha: falhas.length,
      pular: resultados.filter(function (r) {
        return r.status === "PULAR";
      }).length,
    },
    checks: resultados,
    passo_a_passo: [
      "1. Login staff ou perfil duplo → «Abrir painel responsável»",
      "2. Mobile < 1024px",
      "3. Rodar script em /dashboard",
      "4. Ir em Conferir (/notas-pedido) → rodar de novo (R10, R12)",
      "5. Ir em Pagar (/ficha-corrida) → rodar de novo (R11)",
      "6. Validar fila/foto manualmente (R15)",
    ],
  };

  try {
    window.__HB_VERIFICACAO_RESP_7D__ = relatorio;
  } catch (e) {
    /* ignore */
  }

  console.group("HB · Verificação RESPONSÁVEL (~7 dias)");
  console.log("Sessão:", sessao.modo, "| build", build, "| rota", sessao.pathname);
  console.table(
    resultados.map(function (r) {
      return { status: r.status, perfil: r.perfil, id: r.id, titulo: r.titulo, detalhe: r.detalhe };
    })
  );
  console.log("Resumo:", relatorio.resumo);
  if (falhas.length) console.warn("Falhas:", falhas);
  if (avisos.length) console.info("Avisos:", avisos.map(function (a) { return a.id; }));
  console.log("Passo a passo:", relatorio.passo_a_passo);
  console.log("Objeto completo → window.__HB_VERIFICACAO_RESP_7D__");
  console.groupEnd();

  return relatorio;
})().catch(function (fatal) {
  console.error("HB verificação responsável abortou:", fatal);
  return { erro: String(fatal && fatal.message ? fatal.message : fatal) };
});
