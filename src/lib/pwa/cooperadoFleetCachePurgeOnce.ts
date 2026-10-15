import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { purgeCooperadoPwaSnapshotLocalStorageKeys } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import {
  BUILD_SEEN_KEY,
  clearClientRuntimeCaches,
  clearCooperadoReleaseAlignLocalKeys,
} from "@/lib/pwa/clientRelease";
import { markPwaRepairSessionForBuild } from "@/lib/pwa/cooperadoPwaInstallPrepare";
import { COOPERADO_SESSION_STORAGE_KEY } from "@/lib/pwa/cooperadoPwaSilentRepairInline";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";

/**
 * Incrementar para disparar limpeza completa de cache (SW + Cache API + snapshots PWA)
 * em todos os celulares cooperado — uma vez por aparelho por época.
 */
export const COOPERADO_FLEET_CACHE_PURGE_EPOCH = 1;

export const COOPERADO_FLEET_CACHE_PURGE_DONE_KEY = "hb-coop-fleet-cache-purge-epoch";
export const COOPERADO_FLEET_CACHE_PURGE_PENDING_KEY = "hb-coop-fleet-cache-purge-pending";

const PWA_SNAPSHOT_KEY_MARKERS = [
  "hb.coop.inicioCard",
  "hb.coop.pwaInicioDash",
  "hb.coop.pwaEntregasResumos",
  "hb.coop.pwaFichaResumo",
  "hb.coop.readModels",
  "hb.coop.reciboAssinadoLocal",
  "hb.coop.operacionalMaterializedRev",
  "hb.coop.pilotJeferson",
] as const;

const RELEASE_ALIGN_KEYS = [
  "hb-coop-release-align-at",
  "hb-coop-release-align-target",
  "hb-coop-release-nav",
  "hb-coop-release-reload-burst",
  "hb-coop-release-shield-expected",
  "hb-coop-release-urgent-align-fp",
  "hb-coop-mixed-dpl-align-session",
  "hb-coop-release-pending-staff-build",
  "hb-coop-mixed-dpl-align",
] as const;

export function cooperadoFleetCachePurgeAlreadyDone(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return (
      localStorage.getItem(COOPERADO_FLEET_CACHE_PURGE_DONE_KEY) ===
      String(COOPERADO_FLEET_CACHE_PURGE_EPOCH)
    );
  } catch {
    return true;
  }
}

export function cooperadoFleetCachePurgeTarget(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const path = (window.location.pathname || "").toLowerCase();
    if (
      path.includes("pwa-rescue") ||
      path.includes("pwa-launch") ||
      path.includes("pwa-diag") ||
      path.includes("pwa-crash-forensics") ||
      path.includes("pwa-console-forensics")
    ) {
      return false;
    }
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!mobile && !standalone) return false;

    const raw = localStorage.getItem(COOPERADO_SESSION_STORAGE_KEY);
    if (!raw) return true;
    const session = JSON.parse(raw) as { role?: string; cooperadoId?: string };
    if (session?.role && session.role !== "cooperado") return false;
    return true;
  } catch {
    return false;
  }
}

export function markCooperadoFleetCachePurgeDone(): void {
  try {
    localStorage.setItem(
      COOPERADO_FLEET_CACHE_PURGE_DONE_KEY,
      String(COOPERADO_FLEET_CACHE_PURGE_EPOCH)
    );
    localStorage.setItem(BUILD_SEEN_KEY, String(APP_BUILD_VERSION));
    localStorage.setItem(PWA_REPAIR_LOCAL_BUILD_KEY, String(APP_BUILD_VERSION));
    markPwaRepairSessionForBuild(APP_BUILD_VERSION);
  } catch {
    /* ignore */
  }
}

/**
 * Runtime (client): SW + Cache API + snapshots + chaves de align release.
 * Não remove sessão nem AppData operacional.
 */
export async function runCooperadoFleetCachePurgeOnce(): Promise<void> {
  await clearClientRuntimeCaches();
  purgeCooperadoPwaSnapshotLocalStorageKeys();
  clearCooperadoReleaseAlignLocalKeys();
  markCooperadoFleetCachePurgeDone();
}

/**
 * Head inline — primeira abertura no celular após deploy: purge + um reload.
 */
export function buildInlineCooperadoFleetCachePurgeScript(): string {
  const epoch = COOPERADO_FLEET_CACHE_PURGE_EPOCH;
  const doneKey = COOPERADO_FLEET_CACHE_PURGE_DONE_KEY;
  const pendingKey = COOPERADO_FLEET_CACHE_PURGE_PENDING_KEY;
  const sessionKey = COOPERADO_SESSION_STORAGE_KEY;
  const buildSeenKey = BUILD_SEEN_KEY;
  const repairLocalKey = PWA_REPAIR_LOCAL_BUILD_KEY;
  const appBuild = APP_BUILD_VERSION;
  const markersJson = JSON.stringify([...PWA_SNAPSHOT_KEY_MARKERS]);
  const alignKeysJson = JSON.stringify([...RELEASE_ALIGN_KEYS]);

  return `(function(){try{var EPOCH=${epoch};var DONE_KEY=${JSON.stringify(doneKey)};var PENDING_KEY=${JSON.stringify(pendingKey)};var SESSION_KEY=${JSON.stringify(sessionKey)};var MARKERS=${markersJson};var ALIGN_KEYS=${alignKeysJson};var BUILD_SEEN=${JSON.stringify(buildSeenKey)};var REPAIR_LOCAL=${JSON.stringify(repairLocalKey)};var APP_BUILD=${appBuild};function pathBlocked(){var p=(location.pathname||"").toLowerCase();return p.indexOf("pwa-rescue")>=0||p.indexOf("pwa-launch")>=0||p.indexOf("pwa-diag")>=0||p.indexOf("pwa-crash-forensics")>=0||p.indexOf("pwa-console-forensics")>=0;}function isTarget(){if(pathBlocked())return false;try{var mobile=window.matchMedia("(max-width: 1023px)").matches;var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!mobile&&!standalone)return false;var raw=localStorage.getItem(SESSION_KEY);if(!raw)return true;var s=JSON.parse(raw);if(s&&s.role&&s.role!=="cooperado")return false;return true;}catch(e){return false;}}function purgeSnapshots(){try{var keys=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(!k)continue;for(var j=0;j<MARKERS.length;j++){if(k.indexOf(MARKERS[j])>=0){keys.push(k);break;}}}for(var x=0;x<keys.length;x++){localStorage.removeItem(keys[x]);}}catch(e){}}function purgeAlign(){try{for(var i=0;i<ALIGN_KEYS.length;i++){var k=ALIGN_KEYS[i];sessionStorage.removeItem(k);localStorage.removeItem(k);}}catch(e){}}function markDone(){try{localStorage.setItem(DONE_KEY,String(EPOCH));localStorage.setItem(BUILD_SEEN,String(APP_BUILD));localStorage.setItem(REPAIR_LOCAL,String(APP_BUILD));}catch(e){}}function purgeRuntime(){try{if("caches"in window){void caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).catch(function(){});}if("serviceWorker"in navigator){void navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));}).then(function(){try{void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});}catch(e){}}).catch(function(){});}}catch(e){}}if(!isTarget())return;if(sessionStorage.getItem(PENDING_KEY)==="1"){sessionStorage.removeItem(PENDING_KEY);markDone();return;}try{if(localStorage.getItem(DONE_KEY)===String(EPOCH))return;}catch(e){return;}try{sessionStorage.setItem(PENDING_KEY,"1");}catch(e){return;}purgeSnapshots();purgeAlign();purgeRuntime();setTimeout(function(){location.reload();},120);}catch(e){}})();`;
}
