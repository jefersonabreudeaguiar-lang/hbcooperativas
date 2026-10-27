import {
  BUILD_SEEN_KEY,
  PWA_DIRECT_ENTRY_SESSION_KEY,
  PWA_REPAIR_SESSION_KEY,
} from "@/lib/pwa/clientRelease";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";

/** Mesma chave da sessão em `dataStore` / AuthProvider. */
export const COOPERADO_SESSION_STORAGE_KEY = "coopeagriplla_session";

/** Funções inline (head) — reparo PWA sem tela verde de rescue para cooperado. */
export function buildInlineCooperadoPwaSilentRepairBlock(): string {
  const sessionKey = COOPERADO_SESSION_STORAGE_KEY;
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairLocalKey = PWA_REPAIR_LOCAL_BUILD_KEY;
  const buildSeenKey = BUILD_SEEN_KEY;
  return `function hbCoopIsCooperadoPwaSession(){try{var raw=localStorage.getItem("${sessionKey}");if(!raw)return false;var s=JSON.parse(raw);return!!(s&&(s.role==="cooperado"||s.cooperadoId));}catch(e){return false;}}function hbCoopMarkPwaRepair(pageBuild){try{sessionStorage.setItem("${directKey}","1");sessionStorage.setItem("${repairKey}",String(pageBuild));localStorage.setItem("${buildSeenKey}",String(pageBuild));localStorage.setItem("${repairLocalKey}",String(pageBuild));}catch(e){}}function hbCoopSilentPwaPurge(){try{if("caches"in window){void caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).catch(function(){});}if("serviceWorker"in navigator){void navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));}).then(function(){try{void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});}catch(e){}}).catch(function(){});}}catch(e){}}function hbCoopSilentPwaPurgeThen(url){var dest=url||"/login";var went=false;function go(){if(went)return;went=true;try{location.replace(dest);}catch(e){try{location.href=dest;}catch(x){}}}try{var p=Promise.resolve();if("caches"in window){p=p.then(function(){return caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));});});}if("serviceWorker"in navigator){p=p.then(function(){return navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});});}p.finally(go);}catch(e){go();}setTimeout(go,2500);}function hbCoopPwaStaleRepairOrLaunch(pageBuild,loginNext){var next=loginNext||("/login?hb-pwa="+pageBuild);if(hbCoopIsCooperadoPwaSession()){hbCoopMarkPwaRepair(pageBuild);hbCoopSilentPwaPurgeThen(next);return;}hbCoopMarkPwaRepair(pageBuild);try{location.replace(next);}catch(e){location.href=next;}}`;
}
