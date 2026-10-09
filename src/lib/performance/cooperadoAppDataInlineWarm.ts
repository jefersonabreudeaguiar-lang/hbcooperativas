/**
 * Parse antecipado do AppData no <head> — antes do bundle React (cold start PWA cooperado).
 * Fail-closed: se JSON inválido, o app carrega pelo fluxo normal.
 */
const STORAGE_KEY = "coopeagriplla_data";
const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoAppDataWarmScript(): string {
  return `(function(){try{if(typeof localStorage==="undefined")return;if(!localStorage.getItem("${SESSION_KEY}"))return;try{var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;if(standalone&&mobile)return;}catch(x){}var s=localStorage.getItem("${STORAGE_KEY}");if(!s)return;var w=window;w.__hbCoopParsedAppData=JSON.parse(s);}catch(e){try{delete window.__hbCoopParsedAppData;}catch(x){}}})();`;
}

export function takeInlineParsedAppData(): unknown | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { __hbCoopParsedAppData?: unknown };
  const raw = w.__hbCoopParsedAppData;
  if (raw == null) return null;
  delete w.__hbCoopParsedAppData;
  return raw;
}
