import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { BUILD_SEEN_KEY, PWA_REPAIR_SESSION_KEY, PWA_REPAIR_SESSION_VERSION } from "@/lib/pwa/clientRelease";

/**
 * Antes do React: perfil com buildSeen antigo (ex.: 248 vs 343) → pwa-rescue.
 * Evita dashboard quebrar com chunks legados no cache do Edge/Chrome.
 */
export function buildInlineStaleProfileGuardScript(): string {
  const buildSeenKey = BUILD_SEEN_KEY;
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairVer = PWA_REPAIR_SESSION_VERSION;
  const appBuild = APP_BUILD_VERSION;
  return `(function(){try{var path=(location.pathname||"").toLowerCase();if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-diag")>=0||path.indexOf("pwa-crash-forensics")>=0)return;if(path.indexOf("/_next/")>=0)return;var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${appBuild};if(!pageBuild)return;var buildSeenKey="${buildSeenKey}";var repairKey="${repairKey}";var repairVer="${repairVer}";var seen=0;try{seen=parseInt(localStorage.getItem(buildSeenKey)||"0",10);}catch(e){}var repairOk=false;try{repairOk=sessionStorage.getItem(repairKey)===repairVer;}catch(e){}var staleSeen=seen>0&&seen<pageBuild;var needsRepair=!repairOk||staleSeen;if(!needsRepair)return;var next="/login?hb-pwa="+pageBuild;if(path.indexOf("/dashboard")>=0||path.indexOf("/ficha")>=0||path.indexOf("/notas")>=0){next="/login?hb-pwa="+pageBuild+"&next="+encodeURIComponent(location.pathname+location.search);}location.replace("/pwa-rescue.html?auto=1&next="+encodeURIComponent(next));}catch(e){}})();`;
}
