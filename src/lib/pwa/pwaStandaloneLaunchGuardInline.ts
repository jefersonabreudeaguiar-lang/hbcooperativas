/**
 * Guard inline do ícone WebAPK — padrão 0fc3a12a / 1e2897c5 (replaceOnce sem purge destrutivo).
 * Purge no meio da navegação = "This page couldn't load" no Android.
 */
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";

const BUILD_SEEN_KEY = "hb-coop-app-build-seen";
const PWA_DIRECT_ENTRY_SESSION_KEY = "hb-coop-pwa-direct-entry";
const PWA_REPAIR_SESSION_KEY = "hb-coop-pwa-repair-done";
const PWA_STANDALONE_GUARD_DEDUP_KEY = "hb-coop-pwa-standalone-guard-target";
const PWA_STANDALONE_GUARD_AT_KEY = "hb-coop-pwa-standalone-guard-at";
const PWA_STANDALONE_GUARD_BURST_KEY = "hb-coop-pwa-guard-burst";
const PWA_STANDALONE_GUARD_DEDUP_MS = 12_000;
const PWA_STANDALONE_GUARD_BURST_MAX = 3;
const PWA_STANDALONE_GUARD_BURST_WINDOW_MS = 120_000;

export function buildInlinePwaStandaloneLaunchGuardScript(): string {
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairVer = String(APP_BUILD_VERSION);
  const buildSeenKey = BUILD_SEEN_KEY;
  const appBuild = APP_BUILD_VERSION;
  const repairLocalKey = PWA_REPAIR_LOCAL_BUILD_KEY;
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  const dedupKey = PWA_STANDALONE_GUARD_DEDUP_KEY;
  const atKey = PWA_STANDALONE_GUARD_AT_KEY;
  const burstKey = PWA_STANDALONE_GUARD_BURST_KEY;
  const dedupMs = PWA_STANDALONE_GUARD_DEDUP_MS;
  const burstMax = PWA_STANDALONE_GUARD_BURST_MAX;
  const burstWindowMs = PWA_STANDALONE_GUARD_BURST_WINDOW_MS;

  return `(function(){try{var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!standalone)return;try{if(sessionStorage.getItem("${directKey}")==="1")return;}catch(e){}var path=location.pathname||"";if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-diag")>=0)return;var repairKey="${repairKey}";var repairVer="${repairVer}";var repairLocalKey="${repairLocalKey}";var buildSeenKey="${buildSeenKey}";var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${appBuild};if(!pageBuild||pageBuild<1)pageBuild=${appBuild};function repairMarkOk(v){if(!v)return false;var s=String(v);if(s===repairVer||s===String(pageBuild))return true;var n=parseInt(s,10);return n>0&&n>=pageBuild-1;}var seen=0;try{seen=parseInt(localStorage.getItem(buildSeenKey)||"0",10);}catch(e){}var repairLocal=repairMarkOk(localStorage.getItem(repairLocalKey));var repairSession=repairMarkOk(sessionStorage.getItem(repairKey));var repairOk=repairLocal||repairSession;var buildOk=!seen||seen>=pageBuild-1;var veryStale=seen>0&&seen<pageBuild-1;function withCurrentHbPwa(route){var raw=route||"/";try{var u=new URL(raw,location.origin);u.searchParams.set("hb-pwa",String(pageBuild));return u.pathname+u.search+u.hash;}catch(e){var pathOnly=raw.split("?")[0]||"/";var qs=raw.indexOf("?")>=0?raw.slice(raw.indexOf("?")+1):"";var sp=new URLSearchParams(qs);sp.set("hb-pwa",String(pageBuild));var q=sp.toString();return pathOnly+(q?"?"+q:"");}}function allowGuardNav(target){try{var now=Date.now();var lastAt=parseInt(sessionStorage.getItem("${atKey}")||"0",10);var lastTarget=sessionStorage.getItem("${dedupKey}")||"";if(lastTarget===target&&lastAt&&now-lastAt<${dedupMs})return false;var raw=sessionStorage.getItem("${burstKey}");var burst=raw?JSON.parse(raw):[];if(!Array.isArray(burst))burst=[];burst=burst.filter(function(t){return now-t<${burstWindowMs};});if(burst.length>=${burstMax})return false;burst.push(now);sessionStorage.setItem("${burstKey}",JSON.stringify(burst));sessionStorage.setItem("${atKey}",String(now));sessionStorage.setItem("${dedupKey}",target);return true;}catch(e){return true;}}function replaceOnce(url){if(!allowGuardNav(url))return;location.replace(url);}var loginNext=withCurrentHbPwa("/login");var nextPath=withCurrentHbPwa(path+(location.search||""));if(!nextPath||nextPath==="/")nextPath=loginNext;if(repairOk&&buildOk)return;if(buildOk&&path.indexOf("/login")>=0)return;if(!buildOk||veryStale){replaceOnce("/pwa-rescue.html?auto=1&reason=stale_build&next="+encodeURIComponent(loginNext));return;}replaceOnce("/pwa-launch.html?next="+encodeURIComponent(nextPath));}catch(e){}})();`;
}
