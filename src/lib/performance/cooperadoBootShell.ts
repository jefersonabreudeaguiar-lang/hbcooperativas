/**
 * Shell HTML estático no 1º paint (antes do bundle React) — PWA cooperado com sessão.
 * Escondido quando o app React monta (`dismissCooperadoBootShell`).
 */
import {
  PWA_REPAIR_SESSION_KEY,
  PWA_REPAIR_SESSION_VERSION,
} from "@/lib/pwa/clientRelease";

const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoBootShellScript(): string {
  return `(function(){try{if(typeof document==="undefined")return;var el=document.getElementById("hb-coop-boot-shell");if(!el)return;var hide=function(){try{el.style.display="none";el.setAttribute("aria-hidden","true");}catch(e){}};try{if(sessionStorage.getItem("${PWA_REPAIR_SESSION_KEY}")===${JSON.stringify(PWA_REPAIR_SESSION_VERSION)}){hide();return;}}catch(e){}var p=(location.pathname||"").toLowerCase();if(p==="/login"||p.startsWith("/register")||p==="/forgot-password"){hide();return;}if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){hide();return;}var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;if(!standalone&&!mobile){hide();return;}var ms=standalone?900:2200;setTimeout(hide,ms);}catch(e){}})();`;
}

export function dismissCooperadoBootShell(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("hb-coop-boot-shell");
  if (!el) return;
  el.style.display = "none";
  el.setAttribute("aria-hidden", "true");
}
