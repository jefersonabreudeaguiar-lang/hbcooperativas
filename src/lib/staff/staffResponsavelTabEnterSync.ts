/**
 * Ao entrar numa aba da gestão — sync leve do domínio certo (valores atualizados, sem operacional_full).
 * Operacional (financeiro_delta) no máximo 1× por sessão, atrasado — não trava troca de abas.
 */
import { scheduleStaffPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { scheduleStaffGestaoPersistReloadAfterPaint } from "@/services/dataStore";
import { requestSyncTier } from "@/services/syncRequest";
import { staffGestaoDesktopWarmupSyncPaused } from "@/lib/staff/staffGestaoDesktopWarmup";
import { staffResponsavelPausaSyncPesado } from "@/lib/staff/staffResponsavelPausaSyncPesado";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

const MIN_GAP_MS = 45_000;
const OPERACIONAL_HYDRATE_DELAY_MS = 20_000;
/** PC logo após login — paint + interação antes do pull pesado (evita «página sem resposta»). */
const DASHBOARD_WARMUP_HYDRATE_DELAY_MS = 5_000;

let lastPath = "";
let lastAt = 0;
let dashboardInicioHydrateDone = false;
let sessionOperacionalHydrateDone = false;
let operacionalHydrateTimer: number | null = null;

function isStaffGestaoTabPath(pathname: string): boolean {
  const p = pathname || "/";
  return (
    p === "/dashboard" ||
    p.startsWith("/notas-pedido") ||
    p.startsWith("/ficha-corrida") ||
    p.startsWith("/livro-caixa")
  );
}

function clearOperacionalHydrateTimer(): void {
  if (operacionalHydrateTimer != null) {
    clearTimeout(operacionalHydrateTimer);
    operacionalHydrateTimer = null;
  }
}

function runSessionOperacionalHydratePull(): void {
  if (sessionOperacionalHydrateDone) return;
  if (staffTabSwitchQuiescenceActive() || staffResponsavelPausaSyncPesado()) {
    operacionalHydrateTimer = window.setTimeout(runSessionOperacionalHydratePull, 5_000);
    return;
  }
  sessionOperacionalHydrateDone = true;
  scheduleStaffGestaoPersistReloadAfterPaint();
  const tier = staffGestaoDesktopWarmupSyncPaused() ? "financeiro_delta" : "operacional_full";
  requestSyncTier(tier, { force: true, userInitiated: true });
}

/** Uma vez por sessão: merge local + operacional/notas (após paint e fora de quiescence). */
function scheduleSessionOperacionalHydrate(reason: "dashboard-warmup" | "deferred"): void {
  if (sessionOperacionalHydrateDone) return;

  if (reason === "dashboard-warmup") {
    scheduleStaffGestaoPersistReloadAfterPaint();
  }

  if (operacionalHydrateTimer != null) return;

  const delayMs =
    reason === "dashboard-warmup" ? DASHBOARD_WARMUP_HYDRATE_DELAY_MS : OPERACIONAL_HYDRATE_DELAY_MS;

  operacionalHydrateTimer = window.setTimeout(() => {
    operacionalHydrateTimer = null;
    runSessionOperacionalHydratePull();
  }, delayMs);
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
    /** notas_delta é leve — não pode ficar atrás da quiescence de troca de aba (S2 Conferir). */
    if (path.startsWith("/notas-pedido")) {
      requestSyncTier("notas_delta", { force: true, userInitiated: true });
      return;
    }

    if (staffResponsavelPausaSyncPesado()) return;

    const inicioDuranteWarmupPc =
      path === "/dashboard" && !dashboardInicioHydrateDone && staffGestaoDesktopWarmupSyncPaused();
    if (inicioDuranteWarmupPc) {
      dashboardInicioHydrateDone = true;
      scheduleSessionOperacionalHydrate("dashboard-warmup");
      return;
    }

    if (
      path === "/dashboard" &&
      !sessionOperacionalHydrateDone &&
      !staffGestaoDesktopWarmupSyncPaused()
    ) {
      scheduleSessionOperacionalHydrate("deferred");
    }
  });
}

/** Testes — reset debounce. */
export function resetStaffResponsavelTabEnterSyncForTests(): void {
  lastPath = "";
  lastAt = 0;
  dashboardInicioHydrateDone = false;
  sessionOperacionalHydrateDone = false;
  clearOperacionalHydrateTimer();
}
