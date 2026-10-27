import { PWA_DIRECT_ENTRY_SESSION_KEY } from "@/lib/pwa/clientRelease";
import { buildInlineReleaseEpisodeGuardScript } from "@/lib/pwa/pwaReleaseConsistency";
import { buildInlinePwaStandaloneHelper } from "@/lib/pwa/pwaWebApkPolicy";

/** Um align por sessão se o HTML tiver dpl diferente do release canônico (purge Cache API/SW, sem loop). */
export function buildInlineHtmlDeploymentAlignScript(): string {
  const helpers = buildInlineReleaseEpisodeGuardScript();
  const standaloneHelper = buildInlinePwaStandaloneHelper();
  const navKey = "hb-coop-release-nav";
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  return `(function(){${helpers}${standaloneHelper}try{if(hbCoopStandalonePwa())return;var bootPath=(location.pathname||"").toLowerCase();if(bootPath==="/login"||bootPath==="/")return;try{if(sessionStorage.getItem("${directKey}")==="1")return;}catch(e){}var htmlDpl=(document.documentElement.getAttribute("data-dpl-id")||"").trim();if(!htmlDpl||htmlDpl.indexOf("dpl_")!==0)return;if(hbEpisodeBlocked())return;fetch("/api/client-release?_="+Date.now(),{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(c){if(!c||!c.deploymentId)return;if(hbEpisodeBlocked())return;var cloud=String(c.deploymentId).trim();if(!cloud||cloud===htmlDpl)return;hbEpisodePending();Promise.resolve().then(function(){if(!("caches" in window))return;return caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});}).then(function(){if(!("serviceWorker" in navigator))return;return navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});}).finally(function(){hbEpisodeDone();try{sessionStorage.setItem(${JSON.stringify(navKey)},String(Date.now()));}catch(e){}location.replace(hbAlignUrl(cloud));});}).catch(function(){});}catch(e){}})();`;
}
