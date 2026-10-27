import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { BUILD_SEEN_KEY, PWA_REPAIR_SESSION_KEY } from "@/lib/pwa/clientRelease";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";

/** Antes do guard standalone: login com hb-pwa no ícone já conta como reparo (0fc3a12a). */
export function buildInlinePwaLoginHbPwaRepairAckScript(): string {
  const buildSeenKey = BUILD_SEEN_KEY;
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairLocalKey = PWA_REPAIR_LOCAL_BUILD_KEY;
  const appBuild = APP_BUILD_VERSION;
  return `(function(){try{var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!standalone)return;if((location.pathname||"").indexOf("/login")<0)return;if((location.search||"").indexOf("hb-pwa=")<0)return;var b=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${appBuild};var v=String(b);try{sessionStorage.setItem("${repairKey}",v);localStorage.setItem("${buildSeenKey}",v);localStorage.setItem("${repairLocalKey}",v);}catch(e){}}catch(e){}})();`;
}
