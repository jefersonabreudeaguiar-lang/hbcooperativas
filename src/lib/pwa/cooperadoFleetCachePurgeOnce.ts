import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { purgeCooperadoPwaSnapshotLocalStorageKeys } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { isCooperadoEntregaFlowActive } from "@/lib/cooperado/cooperadoEntregaFlowGuard";
import {
  BUILD_SEEN_KEY,
  clearCooperadoReleaseAlignLocalKeys,
} from "@/lib/pwa/clientRelease";
import { markPwaRepairSessionForBuild } from "@/lib/pwa/cooperadoPwaInstallPrepare";
import { COOPERADO_SESSION_STORAGE_KEY } from "@/lib/pwa/cooperadoPwaSilentRepairInline";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";

/**
 * Incrementar para manutenção local segura em todos os celulares cooperado (1× por aparelho).
 * Ver `cooperadoProductionUpdatePhilosophy.ts`.
 */
export const COOPERADO_FLEET_MAINTENANCE_EPOCH = 2;

/** @deprecated use COOPERADO_FLEET_MAINTENANCE_EPOCH */
export const COOPERADO_FLEET_CACHE_PURGE_EPOCH = COOPERADO_FLEET_MAINTENANCE_EPOCH;

export const COOPERADO_FLEET_MAINTENANCE_DONE_KEY = "hb-coop-fleet-cache-purge-epoch";

/** @deprecated */
export const COOPERADO_FLEET_CACHE_PURGE_DONE_KEY = COOPERADO_FLEET_MAINTENANCE_DONE_KEY;

/** Legado — purge agressivo no head não é mais usado. */
export const COOPERADO_FLEET_CACHE_PURGE_PENDING_KEY = "hb-coop-fleet-cache-purge-pending";

let maintenanceScheduled = false;

export function cooperadoFleetCachePurgeAlreadyDone(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return (
      localStorage.getItem(COOPERADO_FLEET_MAINTENANCE_DONE_KEY) ===
      String(COOPERADO_FLEET_MAINTENANCE_EPOCH)
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
      COOPERADO_FLEET_MAINTENANCE_DONE_KEY,
      String(COOPERADO_FLEET_MAINTENANCE_EPOCH)
    );
    localStorage.setItem(BUILD_SEEN_KEY, String(APP_BUILD_VERSION));
    localStorage.setItem(PWA_REPAIR_LOCAL_BUILD_KEY, String(APP_BUILD_VERSION));
    markPwaRepairSessionForBuild(APP_BUILD_VERSION);
  } catch {
    /* ignore */
  }
}

/**
 * Manutenção segura (filosofia de produção): snapshots PWA + chaves de align;
 * opcionalmente Cache API, **sem** desregistrar SW e **sem** reload.
 */
export async function runCooperadoSafeFleetLocalMaintenanceOnce(): Promise<boolean> {
  if (cooperadoFleetCachePurgeAlreadyDone()) return false;
  if (!cooperadoFleetCachePurgeTarget()) return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  if (isCooperadoEntregaFlowActive()) return false;

  try {
    purgeCooperadoPwaSnapshotLocalStorageKeys();
    clearCooperadoReleaseAlignLocalKeys();
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    markCooperadoFleetCachePurgeDone();
    return true;
  } catch {
    maintenanceScheduled = false;
    return false;
  }
}

/** @deprecated Preferir `runCooperadoSafeFleetLocalMaintenanceOnce`. */
export async function runCooperadoFleetCachePurgeOnce(): Promise<void> {
  await runCooperadoSafeFleetLocalMaintenanceOnce();
}

const ENTREGA_DEFER_MS = 90_000;

/**
 * Agenda manutenção 1× por época — após interação, sem bloquear o primeiro frame.
 */
export function scheduleCooperadoSafeFleetMaintenanceOnce(): void {
  if (typeof window === "undefined") return;
  if (cooperadoFleetCachePurgeAlreadyDone()) return;
  if (!cooperadoFleetCachePurgeTarget()) return;
  if (maintenanceScheduled) return;
  maintenanceScheduled = true;

  const attempt = () => {
    if (cooperadoFleetCachePurgeAlreadyDone()) return;
    if (isCooperadoEntregaFlowActive()) {
      window.setTimeout(attempt, ENTREGA_DEFER_MS);
      return;
    }
    void runCooperadoSafeFleetLocalMaintenanceOnce().then((done) => {
      if (!done && !cooperadoFleetCachePurgeAlreadyDone()) {
        maintenanceScheduled = false;
      }
    });
  };

  scheduleCooperadoPostInteractiveTask(attempt);
}

/**
 * Purge agressivo no `<head>` foi removido — risco de reload em loop e perda de fluxo.
 * Mantido no-op para não quebrar imports antigos.
 */
export function buildInlineCooperadoFleetCachePurgeScript(): string {
  return "(function(){})();";
}
