/**
 * Diagnóstico PWA — tela preta / "This page couldn't load"
 *
 * OPCAO A (produção, após deploy com /hb-pwa-diag.js):
 *   fetch('/hb-pwa-diag.js').then(r=>r.text()).then(eval).then(()=>HB_PWA_DIAG_RUN())
 *
 * OPCAO B (cole este arquivo inteiro no Console):
 *   F12 → Console → colar → Enter
 *
 * Envie: copy(__HB_PWA_DIAG__)
 */
(async function hbDiagPwaTelaPreta() {
  if (typeof window.HB_PWA_DIAG_RUN === "function") {
    return window.HB_PWA_DIAG_RUN();
  }
  await fetch("/hb-pwa-diag.js", { cache: "no-store" })
    .then(function (r) {
      return r.text();
    })
    .then(function (src) {
      eval(src);
      return window.HB_PWA_DIAG_RUN();
    })
    .catch(function () {
      console.error("Falha ao carregar /hb-pwa-diag.js — cole scripts/console/diag-pwa-tela-preta.js manualmente.");
    });
})();
