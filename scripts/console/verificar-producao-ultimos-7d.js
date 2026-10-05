/**
 * HB Cooperativas — verificação de produção (últimos ~7 dias de releases)
 *
 * Como usar (F12 → Console, logado no app em https://hbcooperativas.vercel.app):
 * 1. Largura mobile (< 1024px) ou DevTools → modo responsivo.
 * 2. Cole este arquivo inteiro e pressione Enter.
 * 3. Aguarde a Promise; o objeto final fica em window.__HB_VERIFICACAO_7D__
 *
 * Perfis:
 * - qualquer: vale sem login (só deploy/PWA)
 * - logado: qualquer usuário autenticado
 * - cooperado_mobile: papel efetivo cooperado + viewport mobile
 * - responsavel_mobile: responsável/tesoureiro/admin no celular
 *
 * Build mínimo esperado (7 dias): 126 — P0/P1 abas cooperado; 127–128 keep-alive; 129 shell DOM.
 */
(async function hbVerificarProducaoUltimos7d() {
  "use strict";

  var MIN_BUILD_7D = 126;
  var BUILD_SHELL_DIAG = 129;
  var BLOCKED_DPL = ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"];
  var COOP_TAB_HREFS = [
    "/dashboard",
    "/notas-pedido",
    "/precos",
    "/ficha-corrida",
    "/mensalidades",
  ];

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
    return (
      p === "/login" ||
      p.startsWith("/login/") ||
      p.indexOf("redefinir-senha") >= 0
    );
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

  /** Rodapé fixo mobile — evita confundir com menu lateral (drawer). */
  function bottomNavItems() {
    try {
      var fixedBars = document.querySelectorAll("div.fixed.bottom-0, div[class*='bottom-0'][class*='fixed']");
      for (var i = 0; i < fixedBars.length; i++) {
        var bar = fixedBars[i];
        if (bar.closest(".w-72") || bar.closest("[class*='w-72']")) continue;
        var nav = bar.querySelector("nav");
        var row = linksFromNav(nav);
        if (row.length >= 4 && row.length <= 10) return row;
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
    var hrefs = items.map(function (x) {
      return x.href.split("?")[0];
    });
    return (
      labels.indexOf("Entregas") >= 0 &&
      labels.indexOf("Mensalidades") >= 0 &&
      COOP_TAB_HREFS.every(function (h) {
        return hrefs.indexOf(h) >= 0;
      })
    );
  }

  function hasStaffMobileNav(items) {
    var labels = items.map(function (x) {
      return x.label;
    });
    return labels.indexOf("Conferir") >= 0 && labels.indexOf("Pagar") >= 0;
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

    var cooperadoNav = hasCooperadoNav(nav);
    var staffNav = hasStaffMobileNav(nav);
    var greenCoopBar = !!document.querySelector(
      ".border-green-100.bg-green-50\\/95, .border-t.border-green-100"
    );
    var indigoStaffBar = !!document.querySelector(
      ".border-indigo-100.bg-indigo-50\\/95"
    );
    var keepHint = parseKeepAliveState(elAttr("data-hb-keep-alive-state"));
    var keepCooperadoAtivo =
      keepHint &&
      keepHint.enabled &&
      keepHint.mobile &&
      (keepHint.panelCount || 0) >= 1;

    var modoStaffTexto = bodyText.indexOf("Modo responsável") >= 0;
    var modoCoopTexto =
      bodyText.indexOf("Modo cooperado") >= 0 && bodyText.indexOf("Modo responsável") < 0;

    var modo = "desconhecido";
    if (!loggedIn) modo = "nao_logado";
    else if (shell === "cooperado") modo = "cooperado_mobile";
    else if (
      shell === "responsavel" ||
      shell === "tesoureiro" ||
      shell === "admin"
    ) {
      modo = "responsavel_mobile";
    } else if (modoCoopTexto || keepCooperadoAtivo || (cooperadoNav && !staffNav)) {
      modo = "cooperado_mobile";
    } else if (modoStaffTexto || (staffNav && !cooperadoNav)) {
      modo = "responsavel_mobile";
    } else if (greenCoopBar && !indigoStaffBar && cooperadoNav) modo = "cooperado_mobile";
    else if (indigoStaffBar && staffNav) modo = "responsavel_mobile";
    else if (cooperadoNav && staffNav) modo = "ambiguo";
    else if (loggedIn) modo = "logado_outro";

    return {
      mobile: mobile,
      loggedIn: loggedIn,
      pathname: location.pathname,
      shell: shell,
      keepAliveWrap: wrap,
      modo: modo,
      dualPainel: dualPainel,
      nav: nav,
      greenCoopBar: greenCoopBar,
      indigoStaffBar: indigoStaffBar,
      keepCooperadoAtivo: keepCooperadoAtivo,
      modoCoopTexto: modoCoopTexto,
      modoStaffTexto: modoStaffTexto,
    };
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

  function perfilOk(necessario, sessao) {
    if (necessario === "qualquer") return { ok: true };
    if (necessario === "logado" && !sessao.loggedIn) {
      return {
        ok: false,
        pular: true,
        dica: "Entre no app (não use a tela de login).",
      };
    }
    if (necessario === "mobile" && !sessao.mobile) {
      return {
        ok: false,
        pular: true,
        dica: "Use largura < 1024px ou modo responsivo no DevTools.",
      };
    }
    if (necessario === "cooperado_mobile") {
      if (!sessao.loggedIn) {
        return { ok: false, pular: true, dica: "Login como cooperado (ou perfil duplo → Ver como cooperado)." };
      }
      if (!sessao.mobile) {
        return { ok: false, pular: true, dica: "Viewport mobile (< 1024px)." };
      }
      if (sessao.modo === "responsavel_mobile") {
        return {
          ok: false,
          pular: true,
          dica: "Você está no modo responsável. Toque em «Ver como cooperado» ou use login só cooperado.",
        };
      }
      if (sessao.modo !== "cooperado_mobile") {
        var dicaCoop =
          "Shell cooperado não detectado (modo=" + sessao.modo + ").";
        if (sessao.dualPainel) {
          dicaCoop += " Perfil duplo: toque «Ver como cooperado» e rode de novo.";
        } else if (sessao.modo === "logado_outro") {
          dicaCoop += " Use login só cooperado ou abra /dashboard no rodapé verde (5 abas).";
        }
        return { ok: false, pular: true, dica: dicaCoop };
      }
    }
    if (necessario === "responsavel_mobile") {
      if (!sessao.loggedIn) {
        return { ok: false, pular: true, dica: "Login como responsável/tesoureiro/admin." };
      }
      if (!sessao.mobile) {
        return { ok: false, pular: true, dica: "Viewport mobile (< 1024px)." };
      }
      if (sessao.modo === "cooperado_mobile") {
        return {
          ok: false,
          pular: true,
          dica: "Você está como cooperado. Toque «Abrir painel responsável» ou use login staff.",
        };
      }
      if (sessao.modo !== "responsavel_mobile") {
        return {
          ok: false,
          pular: true,
          dica: "Shell responsável não detectado (modo=" + sessao.modo + ").",
        };
      }
    }
    return { ok: true };
  }

  var checks = [];
  function addCheck(row) {
    checks.push(row);
  }

  function statusIcon(st) {
    if (st === "ok") return "OK";
    if (st === "falha") return "FALHA";
    if (st === "aviso") return "AVISO";
    return "PULAR";
  }

  var api = { build: 0, deploymentId: "", gitCommitSha: "" };
  var apiErr = null;
  try {
    var res = await fetch("/api/client-release", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    api = await res.json();
  } catch (e) {
    apiErr = String(e && e.message ? e.message : e);
  }

  var htmlBuild = parseInt(elAttr("data-app-build") || "0", 10);
  var htmlDpl = (elAttr("data-dpl-id") || "").trim();
  var keepFlag = elAttr("data-cooperado-tab-keep-alive");
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
  var panelHrefs = [];
  try {
    document.querySelectorAll("[data-cooperado-tab-panel]").forEach(function (node) {
      panels++;
      var h = node.getAttribute("data-cooperado-tab-panel");
      if (h) panelHrefs.push(h);
    });
  } catch (e) {
    /* ignore */
  }

  var onCoopTab =
    COOP_TAB_HREFS.indexOf((location.pathname || "").split("?")[0]) >= 0;

  // ——— Checks ———

  addCheck({
    id: "01_api_client_release",
    titulo: "API /api/client-release responde",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      if (apiErr) return { st: "falha", msg: apiErr };
      if (!build) return { st: "falha", msg: "build ausente na API" };
      return {
        st: "ok",
        msg: "build " + build + " · sha " + (api.gitCommitSha || "").slice(0, 7) + " · dpl " + (api.deploymentId || "(vazio)").slice(0, 12),
      };
    },
  });

  addCheck({
    id: "02_build_minimo_7d",
    titulo: "Build mínimo dos últimos 7 dias (>=" + MIN_BUILD_7D + ")",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      if (!build) return { st: "falha", msg: "build desconhecido" };
      if (build < MIN_BUILD_7D) {
        return {
          st: "falha",
          msg: "build " + build + " — faça hard refresh ou aguarde deploy (esperado >=" + MIN_BUILD_7D + ")",
        };
      }
      var extra =
        build >= BUILD_SHELL_DIAG
          ? "Inclui diagnóstico shell (129+)."
          : build >= 128
            ? "Keep-alive telemetria (128). Shell wrap só no 129+."
            : "OK para P0/P1 abas (126+).";
      return { st: "ok", msg: "build " + build + ". " + extra };
    },
  });

  addCheck({
    id: "03_html_api_build",
    titulo: "HTML data-app-build = API build",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      if (!htmlBuild) return { st: "aviso", msg: "data-app-build ausente no HTML" };
      if (api.build && htmlBuild !== api.build) {
        return { st: "falha", msg: "HTML " + htmlBuild + " ≠ API " + api.build + " — recarregue (Ctrl+F5)" };
      }
      return { st: "ok", msg: "build " + htmlBuild };
    },
  });

  addCheck({
    id: "04_dpl_alinhado",
    titulo: "Deployment (dpl) HTML + chunks alinhados",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      var canon = (api.deploymentId || htmlDpl || "").trim();
      if (!canon) return { st: "aviso", msg: "dpl canônico vazio (preview/local?)" };
      if (htmlDpl && htmlDpl !== canon) {
        return { st: "falha", msg: "HTML dpl ≠ API" };
      }
      var bad = loadedDpls.filter(function (id) {
        return id !== canon;
      });
      if (bad.length) {
        return {
          st: "falha",
          msg: "Chunks com dpl diferente: " + bad.join(", ") + " (esperado " + canon.slice(0, 14) + "…)",
        };
      }
      return { st: "ok", msg: "dpl único · " + loadedDpls.length + " chunk(s)" };
    },
  });

  addCheck({
    id: "05_dpl_bloqueado",
    titulo: "Sem deployment legado bloqueado",
    perfil: "qualquer",
    minBuild: 0,
    run: function () {
      var hit = loadedDpls.filter(function (id) {
        return BLOCKED_DPL.indexOf(id) >= 0;
      });
      if (hit.length) return { st: "falha", msg: "Runtime legado: " + hit.join(", ") };
      return { st: "ok", msg: "nenhum dpl bloqueado" };
    },
  });

  addCheck({
    id: "06_keep_alive_flag",
    titulo: "Flag keep-alive no HTML (build 126+)",
    perfil: "qualquer",
    minBuild: 126,
    run: function () {
      if (keepFlag === "0") return { st: "falha", msg: "data-cooperado-tab-keep-alive=0 (env desligou)" };
      if (keepFlag !== "1") return { st: "aviso", msg: "atributo ausente ou build antigo" };
      return { st: "ok", msg: "keep-alive habilitado no build" };
    },
  });

  addCheck({
    id: "07_pwa_page_release",
    titulo: "Objeto __HB_PAGE_RELEASE__ / anti-rollback",
    perfil: "qualquer",
    minBuild: 119,
    run: function () {
      if (!pageRelease || !pageRelease.deploymentId) {
        return { st: "aviso", msg: "Sem __HB_PAGE_RELEASE__ — hard refresh ou login" };
      }
      if (api.build && pageRelease.build !== api.build) {
        return { st: "falha", msg: "page build " + pageRelease.build + " ≠ API " + api.build };
      }
      return { st: "ok", msg: "page build " + pageRelease.build };
    },
  });

  addCheck({
    id: "08_service_worker_build",
    titulo: "Service Worker registrado com build atual",
    perfil: "logado",
    minBuild: 119,
    run: async function () {
      if (!("serviceWorker" in navigator)) {
        return { st: "aviso", msg: "SW não suportado neste browser" };
      }
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { st: "aviso", msg: "SW ainda não registrado (aguarde ou reinstale PWA)" };
      var url =
        (reg.active && reg.active.scriptURL) ||
        (reg.installing && reg.installing.scriptURL) ||
        "";
      var m = url.match(/build=(\d+)/);
      var swBuild = m ? parseInt(m[1], 10) : 0;
      if (build && swBuild && swBuild !== build) {
        return { st: "aviso", msg: "SW build " + swBuild + " ≠ app " + build + " — atualize pelo banner" };
      }
      return { st: "ok", msg: swBuild ? "sw build " + swBuild : "SW ok (" + url.slice(-40) + ")" };
    },
  });

  addCheck({
    id: "09_sessao_modo",
    titulo: "Modo de sessão detectado",
    perfil: "logado",
    minBuild: 0,
    run: function () {
      return {
        st: "ok",
        msg:
          "modo=" +
          sessao.modo +
          (sessao.dualPainel ? " · perfil duplo (barra indigo)" : "") +
          " · shell=" +
          (sessao.shell || "null") +
          " · nav=" +
          sessao.nav.map(function (n) {
            return n.label;
          }).join("|"),
      };
    },
  });

  addCheck({
    id: "10_cooperado_faixa_verde",
    titulo: "Faixa verde cooperado + badge vNNN",
    perfil: "cooperado_mobile",
    minBuild: 119,
    run: function () {
      if (!sessao.greenCoopBar) {
        return { st: "falha", msg: "Faixa verde do cooperado não encontrada no rodapé" };
      }
      var badge = document.querySelector(".tabular-nums.font-bold");
      var txt = badge ? badge.textContent : "";
      if (build && txt.indexOf("v" + build) < 0) {
        return { st: "aviso", msg: "Faixa ok, badge '" + txt + "' ≠ build " + build };
      }
      return { st: "ok", msg: "rodapé cooperado · " + (txt || "badge ok") };
    },
  });

  addCheck({
    id: "11_cooperado_keep_alive_ativo",
    titulo: "Keep-alive abas cooperado (126–128+) em rota de aba",
    perfil: "cooperado_mobile",
    minBuild: 126,
    run: function () {
      if (!onCoopTab) {
        return {
          st: "aviso",
          msg: "Abra uma aba do rodapé (" + COOP_TAB_HREFS.join(", ") + ") — agora: " + sessao.pathname,
        };
      }
      if (!keepStateRaw) {
        return {
          st: "falha",
          msg: "data-hb-keep-alive-state ausente — componente não montou",
        };
      }
      if (!keepParsed || typeof keepParsed.enabled !== "boolean") {
        return { st: "falha", msg: "state ilegível: " + keepStateRaw };
      }
      if (!keepParsed.enabled) return { st: "falha", msg: "keep-alive desligado (e0)" };
      if (!keepParsed.mobile) return { st: "falha", msg: "viewport não mobile no state (m0)" };
      if (!keepParsed.onTab) return { st: "aviso", msg: "fora de aba bottom (t0)" };
      if (panels < 1) {
        return { st: "falha", msg: "0 painéis — esperado ≥1 em " + sessao.pathname };
      }
      return {
        st: "ok",
        msg: keepStateRaw + " · painéis=" + panels + " · " + panelHrefs.join(","),
      };
    },
  });

  addCheck({
    id: "12_cooperado_shell_wrap_129",
    titulo: "Diagnóstico shell data-hb-* (build 129+)",
    perfil: "cooperado_mobile",
    minBuild: BUILD_SHELL_DIAG,
    run: function () {
      if (build < BUILD_SHELL_DIAG) {
        return {
          st: "aviso",
          msg: "Produção ainda em build " + build + " — wrap/shell só após deploy 129",
        };
      }
      if (sessao.shell !== "cooperado") {
        return { st: "falha", msg: "data-hb-shell-mode=" + (sessao.shell || "null") };
      }
      if (sessao.keepAliveWrap !== "1") {
        return { st: "falha", msg: "data-hb-keep-alive-wrap=" + (sessao.keepAliveWrap || "null") };
      }
      return { st: "ok", msg: "shell=cooperado · wrap=1" };
    },
  });

  addCheck({
    id: "13_responsavel_faixa_indigo",
    titulo: "Faixa indigo staff + rodapé Conferir/Pagar",
    perfil: "responsavel_mobile",
    minBuild: 119,
    run: function () {
      if (!sessao.indigoStaffBar && !hasStaffMobileNav(sessao.nav)) {
        return { st: "falha", msg: "UI responsável mobile não detectada" };
      }
      if (sessao.greenCoopBar && hasCooperadoNav(sessao.nav)) {
        return { st: "aviso", msg: "Parece UI cooperado — confirme modo responsável" };
      }
      return { st: "ok", msg: "staff mobile · " + sessao.nav.slice(0, 5).map(function (n) { return n.label; }).join(", ") };
    },
  });

  addCheck({
    id: "14_responsavel_sem_keep_alive",
    titulo: "Modo responsável NÃO monta keep-alive cooperado",
    perfil: "responsavel_mobile",
    minBuild: 126,
    run: function () {
      if (panels > 0) {
        return {
          st: "falha",
          msg: panels + " painéis cooperado montados — não deveria no modo staff",
        };
      }
      if (keepStateRaw && keepParsed && keepParsed.panelCount > 0) {
        return { st: "falha", msg: "state keep-alive ativo no staff: " + keepStateRaw };
      }
      return { st: "ok", msg: "sem painéis cooperado (esperado)" };
    },
  });

  addCheck({
    id: "15_rql_marcas_perf",
    titulo: "Marcas RQL de navegação (opcional — troque de aba antes)",
    perfil: "cooperado_mobile",
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
            return n.indexOf("rql:route:") === 0 || n.indexOf("rql:route-paint:") === 0;
          });
      } catch (e) {
        return { st: "aviso", msg: "performance API indisponível" };
      }
      if (!marks.length) {
        return {
          st: "aviso",
          msg: "Nenhuma marca ainda — navegue Início→Entregas→Preços e rode de novo",
        };
      }
      return { st: "ok", msg: marks.length + " marcas · ex: " + marks.slice(-3).join(", ") };
    },
  });

  addCheck({
    id: "16_banner_nova_versao",
    titulo: "Sem banner preso de «versão nova»",
    perfil: "logado",
    minBuild: 0,
    run: function () {
      var banner = document.body && document.body.innerText.indexOf("Há uma versão nova do app") >= 0;
      if (banner) {
        return { st: "aviso", msg: "Banner de atualização visível — toque Atualizar" };
      }
      return { st: "ok", msg: "sem banner de update" };
    },
  });

  // Executar checks
  var resultados = [];
  for (var c = 0; c < checks.length; c++) {
    var chk = checks[c];
    var gate = perfilOk(chk.perfil, sessao);
    var row = {
      id: chk.id,
      titulo: chk.titulo,
      perfil: chk.perfil,
      status: "PULAR",
      detalhe: "",
    };

    if (build && chk.minBuild && build < chk.minBuild) {
      row.status = "PULAR";
      row.detalhe = "Build " + build + " < " + chk.minBuild + " (release ainda não inclui este item)";
    } else if (gate.pular) {
      row.status = "PULAR";
      row.detalhe = gate.dica || "perfil inadequado";
    } else {
      try {
        var out = chk.run();
        if (out && typeof out.then === "function") out = await out;
        row.status = statusIcon(out.st);
        row.detalhe = out.msg || "";
      } catch (err) {
        row.status = "FALHA";
        row.detalhe = "Erro: " + (err && err.message ? err.message : err);
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
  var pulados = resultados.filter(function (r) {
    return r.status === "PULAR";
  });

  var relatorio = {
    quando: new Date().toISOString(),
    url: location.href,
    innerWidth: window.innerWidth,
    mobile: sessao.mobile,
    sessao: sessao,
    release: {
      build: build,
      sha: (api.gitCommitSha || "").slice(0, 7),
      deploymentId: api.deploymentId || htmlDpl,
      keepAliveFlag: keepFlag,
      keepAliveState: keepStateRaw,
      keepAlivePanels: panels,
      panelHrefs: panelHrefs,
      tudo_alinhado:
        !apiErr &&
        build >= MIN_BUILD_7D &&
        (!api.deploymentId || !htmlDpl || htmlDpl === api.deploymentId) &&
        loadedDpls.every(function (id) {
          return !api.deploymentId || id === api.deploymentId;
        }),
    },
    resumo: {
      ok: ok.length,
      aviso: avisos.length,
      falha: falhas.length,
      pular: pulados.length,
    },
    checks: resultados,
    instrucoes: {
      cooperado:
        "Login cooperado (ou perfil duplo → «Ver como cooperado»), mobile, aba /dashboard — checks 10–12 e 15.",
      responsavel:
        "Login responsável (ou «Abrir painel responsável»), mobile — checks 13–14.",
      deploy: "Checks 01–07 valem na tela de login ou logado.",
    },
  };

  try {
    window.__HB_VERIFICACAO_7D__ = relatorio;
  } catch (e) {
    /* ignore */
  }

  console.group("HB · Verificação produção (~7 dias)");
  console.log("Sessão:", sessao.modo, "| build", build, "| mobile", sessao.mobile);
  console.table(
    resultados.map(function (r) {
      return { status: r.status, perfil: r.perfil, check: r.id, titulo: r.titulo, detalhe: r.detalhe };
    })
  );
  console.log("Resumo:", relatorio.resumo);
  if (falhas.length) console.warn("Falhas:", falhas.map(function (f) { return f.id + ": " + f.detalhe; }));
  if (avisos.length) console.info("Avisos:", avisos.map(function (a) { return a.id + ": " + a.detalhe; }));
  if (pulados.length && sessao.dualPainel && sessao.modo === "logado_outro") {
    console.info(
      "Perfil duplo: o script leu menu errado ou você está em gestão (admin). «Ver como cooperado» → checks 10–11; «Abrir painel responsável» → 13–14."
    );
  } else if (pulados.length >= 4 && sessao.modo === "logado_outro") {
    console.info(
      "Checks 10–15 precisam do rodapé mobile (Conferir/Pagar ou Entregas/Mensalidades), não menu lateral."
    );
  }
  console.log("Objeto completo → window.__HB_VERIFICACAO_7D__");
  console.groupEnd();

  return relatorio;
})().catch(function (fatal) {
  console.error("HB verificação abortou:", fatal);
  return { erro: String(fatal && fatal.message ? fatal.message : fatal) };
});
