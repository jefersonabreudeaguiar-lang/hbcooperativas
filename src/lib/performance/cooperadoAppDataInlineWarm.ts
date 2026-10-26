/**
 * Parse antecipado do AppData no <head> — antes do bundle React (cold start PWA cooperado).
 * Fail-closed: se JSON inválido, o app carrega pelo fluxo normal.
 */
import { cooperadoMobilePilotInlineSessionHelperJs } from "@/lib/cooperado/cooperadoMobilePilotInlineSession";
import { cooperadoV2InlineHeadSkipAppDataWarmJs } from "@/lib/cooperado-v2/cooperadoV2ClientLite";

const STORAGE_KEY = "coopeagriplla_data";
const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoAppDataWarmScript(): string {
  const pilotFn = cooperadoMobilePilotInlineSessionHelperJs();
  const v2Skip = cooperadoV2InlineHeadSkipAppDataWarmJs();
  return `(function(){try{${v2Skip}${pilotFn}if(typeof localStorage==="undefined")return;if(!localStorage.getItem("${SESSION_KEY}"))return;var parse=function(){try{var s=localStorage.getItem("${STORAGE_KEY}");if(!s)return;var w=window;w.__hbCoopParsedAppData=JSON.parse(s);}catch(e){try{delete window.__hbCoopParsedAppData;}catch(x){}}};var defer=false;try{var raw=localStorage.getItem("${SESSION_KEY}");if(raw){var sess=JSON.parse(raw);var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;if(hbCoopSessPilot(sess)&&(standalone||mobile))defer=true;if(standalone&&mobile&&!defer)defer=true;}}catch(x){}if(defer){if(typeof requestIdleCallback!=="undefined"){requestIdleCallback(parse,{timeout:90000});}else{setTimeout(parse,90000);}return;}parse();}catch(e){try{delete window.__hbCoopParsedAppData;}catch(x){}}})();`;
}

export function takeInlineParsedAppData(): unknown | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { __hbCoopParsedAppData?: unknown };
  const raw = w.__hbCoopParsedAppData;
  if (raw == null) return null;
  delete w.__hbCoopParsedAppData;
  return raw;
}
