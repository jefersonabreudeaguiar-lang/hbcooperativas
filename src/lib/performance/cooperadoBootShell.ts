/**
 * Shell HTML estático no 1º paint (antes do bundle React) — PWA cooperado com sessão.
 * Escondido quando o app React monta (`dismissCooperadoBootShell`).
 */
const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoBootShellScript(): string {
  return `(function(){try{if(typeof document==="undefined")return;var el=document.getElementById("hb-coop-boot-shell");if(!el)return;if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){el.style.display="none";return;}var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;if(!standalone&&!mobile){el.style.display="none";}}catch(e){}})();`;
}

export function dismissCooperadoBootShell(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("hb-coop-boot-shell");
  if (!el) return;
  el.style.display = "none";
}
