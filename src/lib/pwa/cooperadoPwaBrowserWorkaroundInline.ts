import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  COOPERADO_PWA_BROWSER_HANDOFF_SESSION_KEY,
  COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY,
  COOPERADO_PWA_BROWSER_WORKAROUND_ENABLED,
} from "@/lib/pwa/cooperadoPwaBrowserWorkaround";

const SESSION_KEY = "coopeagriplla_session";

/**
 * Antes do React: cooperado no ícone PWA → Chrome + pwa-rescue (sem pintar o app).
 */
export function buildInlineCooperadoPwaBrowserWorkaroundScript(): string {
  if (!COOPERADO_PWA_BROWSER_WORKAROUND_ENABLED) return "";

  const build = APP_BUILD_VERSION;
  const optOutKey = COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY;
  const handoffKey = COOPERADO_PWA_BROWSER_HANDOFF_SESSION_KEY;
  const sessionKey = SESSION_KEY;

  return `(function(){try{if(!${COOPERADO_PWA_BROWSER_WORKAROUND_ENABLED})return;var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!standalone)return;try{if(localStorage.getItem("${optOutKey}")==="1")return;if(sessionStorage.getItem("${handoffKey}")==="1")return;}catch(e){}var path=(location.pathname||"").toLowerCase();if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-diag")>=0||path.indexOf("pwa-crash")>=0||path.indexOf("pwa-console")>=0)return;var cooperado=false;try{var raw=localStorage.getItem("${sessionKey}");if(raw){var s=JSON.parse(raw);cooperado=s&&(s.role==="cooperado"||!!s.cooperadoId);}}catch(e){}if(!cooperado)return;try{sessionStorage.setItem("${handoffKey}","1");}catch(e){}var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${build};var loginNext="/login?hb-pwa="+pageBuild+"&next="+encodeURIComponent("/dashboard");var rescuePath="/pwa-rescue.html?auto=1&next="+encodeURIComponent(loginNext);var absolute=location.origin.replace(/\\/$/,"")+rescuePath;var ua=navigator.userAgent||"";if(/Android/i.test(ua)){var tail=absolute.replace(/^https?:\\/\\//i,"");var intent="intent://"+tail+"#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url="+encodeURIComponent(absolute)+";end";try{window.location.href=intent;}catch(e){}window.setTimeout(function(){try{if(sessionStorage.getItem("${handoffKey}")!=="1")return;window.location.replace(absolute);}catch(e2){}},280);return;}window.location.replace(absolute);}catch(e){}})();`;
}
