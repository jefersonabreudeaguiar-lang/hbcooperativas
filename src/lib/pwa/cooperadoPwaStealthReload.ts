import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Workaround até o WebAPK abrir sem “This page couldn’t load”. */
/** Desligado: reload extra no WebAPK somava com guard/SW (0fc3a12a não tinha este passo). */
export const COOPERADO_PWA_STEALTH_RELOAD_ENABLED = false;

export const COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY = `hb-coop-pwa-stealth-reload-${APP_BUILD_VERSION}`;

const SESSION_KEY = "coopeagriplla_session";

/**
 * 1ª abertura do ícone (sessão): reload silencioso — cooperado só vê o splash HB.
 * Na 2ª carga os guards normais rodam com runtime já aquecido.
 */
export function buildInlineCooperadoPwaStealthReloadScript(): string {
  if (!COOPERADO_PWA_STEALTH_RELOAD_ENABLED) return "";

  const build = APP_BUILD_VERSION;
  const reloadKey = COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY;
  const sessionKey = SESSION_KEY;

  return `(function(){try{if(!${COOPERADO_PWA_STEALTH_RELOAD_ENABLED})return;var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!standalone)return;var path=(location.pathname||"").toLowerCase();if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-diag")>=0||path.indexOf("pwa-crash")>=0||path.indexOf("pwa-console")>=0)return;var cooperado=false;try{var raw=localStorage.getItem("${sessionKey}");if(raw){var s=JSON.parse(raw);cooperado=s&&(s.role==="cooperado"||!!s.cooperadoId);}}catch(e){}if(!cooperado)return;var KEY="${reloadKey}";try{if(sessionStorage.getItem(KEY)==="done")return;sessionStorage.setItem(KEY,"done");}catch(e){return;}var shell=document.getElementById("hb-coop-boot-shell");if(shell){shell.style.display="flex";shell.setAttribute("aria-hidden","false");}location.reload();}catch(e){}})();`;
}
