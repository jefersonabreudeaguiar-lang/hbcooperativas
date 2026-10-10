/**
 * Shell HTML estático no 1º paint (antes do bundle React) — PWA cooperado com sessão.
 * Escondido quando o app React monta (`dismissCooperadoBootShell`).
 */
const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoBootShellScript(): string {
  return `(function(){try{if(typeof document==="undefined")return;var el=document.getElementById("hb-coop-boot-shell");if(!el)return;var hide=function(){try{el.style.display="none";}catch(e){}};var p=(location.pathname||"").toLowerCase();if(p==="/login"||p.startsWith("/register")||p==="/forgot-password"){hide();return;}if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){hide();return;}var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;if(!standalone&&!mobile){hide();return;}setTimeout(hide,4500);}catch(e){}})();`;
}

export function dismissCooperadoBootShell(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("hb-coop-boot-shell");
  if (!el) return;
  el.style.display = "none";
}
