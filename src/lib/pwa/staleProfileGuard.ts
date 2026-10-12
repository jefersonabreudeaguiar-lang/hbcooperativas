import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  BUILD_SEEN_KEY,
  PWA_DIRECT_ENTRY_SESSION_KEY,
  PWA_REPAIR_SESSION_KEY,
  PWA_REPAIR_SESSION_VERSION,
} from "@/lib/pwa/clientRelease";

/** localStorage — sobrevive ao fechar o WebAPK (sessionStorage não). */
export const PWA_REPAIR_LOCAL_BUILD_KEY = "hb-coop-pwa-repair-done-build";

/**
 * Só no ícone instalado: perfil muito antigo → pwa-rescue (sem loop no navegador).
 */
export function buildInlineStaleProfileGuardScript(): string {
  const buildSeenKey = BUILD_SEEN_KEY;
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairVer = PWA_REPAIR_SESSION_VERSION;
  const repairLocalKey = PWA_REPAIR_LOCAL_BUILD_KEY;
  const appBuild = APP_BUILD_VERSION;
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  return `(function(){try{var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!standalone)return;try{if(sessionStorage.getItem("${directKey}")==="1")return;}catch(e){}var path=(location.pathname||"").toLowerCase();if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-diag")>=0||path.indexOf("pwa-crash-forensics")>=0||path.indexOf("pwa-console-forensics")>=0)return;var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${appBuild};if(!pageBuild)return;function repairMarkOk(v){if(!v)return false;var s=String(v);if(s==="${repairVer}"||s===String(pageBuild))return true;var n=parseInt(s,10);return n>0&&n>=pageBuild-1;}var seen=0;try{seen=parseInt(localStorage.getItem("${buildSeenKey}")||"0",10);}catch(e){}var repairLocal=false;var repairSession=false;try{repairLocal=repairMarkOk(localStorage.getItem("${repairLocalKey}"));}catch(e){}try{repairSession=repairMarkOk(sessionStorage.getItem("${repairKey}"));}catch(e){}var veryStale=seen>0&&seen<pageBuild-1;if(!veryStale||repairLocal||repairSession)return;var next="/login?hb-pwa="+pageBuild;location.replace("/pwa-rescue.html?auto=1&next="+encodeURIComponent(next));}catch(e){}})();`;
}
