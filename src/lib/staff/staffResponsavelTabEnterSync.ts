/**
 * Ao entrar numa aba da gestão — sync leve do domínio certo (valores atualizados, sem operacional_full).
 */
import { scheduleStaffPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { reloadStaffGestaoPersistAfterFirstPaint } from "@/services/dataStore";
import type { SyncTier } from "@/lib/performance/syncTier";
import { requestSyncTier } from "@/services/syncRequest";
import { staffGestaoDesktopWarmupSyncPaused } from "@/lib/staff/staffGestaoDesktopWarmup";
import { staffResponsavelPausaSyncPesado } from "@/lib/staff/staffResponsavelPausaSyncPesado";

const MIN_GAP_MS = 45_000;

let lastPath = "";
let lastAt = 0;
let dashboardInicioHydrateDone = false;

function isStaffGestaoTabPath(pathname: string): boolean {
  const p = pathname || "/";
  return (
    p === "/dashboard" ||
    p.startsWith("/notas-pedido") ||
    p.startsWith("/ficha-corrida") ||
    p.startsWith("/livro-caixa")
  );
}

function syncTiersForTab(pathname: string): SyncTier[] {
  if (pathname === "/dashboard") return ["financeiro_delta", "notas_delta"];
  if (pathname.startsWith("/ficha-corrida")) return ["financeiro_delta"];
  if (pathname.startsWith("/livro-caixa")) return ["pulse"];
  return ["notas_delta"];
}

function runTabEnterSyncTiers(path: string, force: boolean): void {
  for (const tier of syncTiersForTab(path)) {
    requestSyncTier(tier, { force });
  }
}

export function scheduleStaffResponsavelTabEnterSync(pathname: string): void {
  if (typeof window === "undefined") return;
  const path = (pathname || "/").trim() || "/";
  if (!isStaffGestaoTabPath(path)) return;

  const now = Date.now();
  if (path === lastPath && now - lastAt < MIN_GAP_MS) return;
  lastPath = path;
  lastAt = now;

  scheduleStaffPostInteractiveTask(() => {
    if (staffResponsavelPausaSyncPesado()) return;
    const inicioDuranteWarmupPc =
      path === "/dashboard" && !dashboardInicioHydrateDone && staffGestaoDesktopWarmupSyncPaused();
    if (staffGestaoDesktopWarmupSyncPaused() && !inicioDuranteWarmupPc) return;
    if (inicioDuranteWarmupPc) {
      dashboardInicioHydrateDone = true;
      reloadStaffGestaoPersistAfterFirstPaint();
      runTabEnterSyncTiers(path, true);
      return;
    }
    runTabEnterSyncTiers(path, false);
  });
}

/** Testes — reset debounce. */
export function resetStaffResponsavelTabEnterSyncForTests(): void {
  lastPath = "";
  lastAt = 0;
  dashboardInicioHydrateDone = false;
}
