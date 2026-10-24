import type { User } from "@/types";
import { COOPERADO_BOTTOM_TAB_HREFS } from "@/lib/performance/cooperadoBottomTabRoutes";
import {
  COOPERADO_TAB_FINANCEIRO_HREF,
  COOPERADO_TAB_PIN_HREF,
  isCooperadoTabPinned,
} from "@/lib/performance/cooperadoMobileTabKeepAlive";
import { COOPERADO_FOREGROUND_STALE_MS } from "@/lib/performance/cooperadoEventDrivenSync";
import { COOPERADO_MOBILE_TAB_DOM_POLICY } from "@/lib/performance/cooperadoMobileTabDomPolicy";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { isCooperadoPwaMobileEntregasLeve } from "@/lib/cooperado/cooperadoPwaMobileEntregas";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

/** Bump ao mudar política de abas/DOM só do piloto Jeferson. */
export const COOPERADO_MOBILE_PILOT_TAB_DOM_POLICY = "pilot-jeferson-perf-1";

const PILOT_FOREGROUND_STALE_MS = 3 * 60_000;
const PILOT_TAB_ENTREGAS_HREF = "/notas-pedido";

const PILOT_FINANCE_GATE_L1_PATHS = [
  "/dashboard",
  "/ficha-corrida",
  "/notas-pedido",
  "/precos",
] as const;

const ATTR_PILOT_PERF = "data-cooperado-pilot-perf";

/** Perf mobile cooperado GA (ex-piloto Jeferson) — cooperado autenticado ou flag DOM. */
export function isCooperadoMobilePilotPerfActive(
  user?: Omit<User, "password"> | null
): boolean {
  if (user && isCooperadoMobileGaPromoted(user)) return true;
  if (typeof document !== "undefined") {
    return document.documentElement.getAttribute(ATTR_PILOT_PERF) === "1";
  }
  return false;
}

export function applyCooperadoMobilePilotPerfDomFlag(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof document === "undefined") return;
  if (user && isCooperadoMobileGaPromoted(user)) {
    document.documentElement.setAttribute(ATTR_PILOT_PERF, "1");
    return;
  }
  document.documentElement.removeAttribute(ATTR_PILOT_PERF);
}

export function resolveCooperadoForegroundStaleMs(
  user?: Omit<User, "password"> | null
): number {
  return isCooperadoMobilePilotPerfActive(user)
    ? PILOT_FOREGROUND_STALE_MS
    : COOPERADO_FOREGROUND_STALE_MS;
}

export function resolveCooperadoMobileTabDomPolicy(
  user?: Omit<User, "password"> | null
): string {
  if (isCooperadoMobilePilotPerfActive(user)) {
    return COOPERADO_MOBILE_PILOT_TAB_DOM_POLICY;
  }
  return COOPERADO_MOBILE_TAB_DOM_POLICY;
}

/** LRU: +1 slot só no piloto (Início + Financeiro + Entregas). */
export function resolveCooperadoMobileTabCacheLimitPilotBonus(
  user?: Omit<User, "password"> | null
): number {
  return isCooperadoMobilePilotPerfActive(user) ? 1 : 0;
}

/** Abas que não devem ser expulsas do LRU no piloto. */
export function isCooperadoTabPinnedForSession(
  href: string,
  user?: Omit<User, "password"> | null
): boolean {
  if (isCooperadoTabPinned(href)) return true;
  return isCooperadoMobilePilotPerfActive(user) && href === PILOT_TAB_ENTREGAS_HREF;
}

export const COOPERADO_PILOT_TRIPLE_MOUNT_HREFS: readonly string[] = [
  COOPERADO_TAB_PIN_HREF,
  COOPERADO_TAB_FINANCEIRO_HREF,
  PILOT_TAB_ENTREGAS_HREF,
];

export function cooperadoPilotTripleMountEnabled(
  user?: Omit<User, "password"> | null
): boolean {
  void user;
  /** Desligado — triple-mount + cache LRU causava Início só com “Olá” após rollback de build. */
  return false;
}

export function cooperadoPilotInstantBottomTabSwitchEnabled(
  user?: Omit<User, "password"> | null
): boolean {
  return isCooperadoMobilePilotPerfActive(user);
}

export function cooperadoPilotBottomTabHrefs(): readonly string[] {
  return COOPERADO_BOTTOM_TAB_HREFS;
}

/** Gate financeiro L1 — Início/Entregas/Preços sem bloquear UI durante sync silencioso. */
export function cooperadoPilotFinanceGateLiveL1Path(pathname: string): boolean {
  return PILOT_FINANCE_GATE_L1_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Snapshot-first no card “A receber” (mesmo padrão PWA leve, só Jeferson). */
export function cooperadoMobilePilotSnapshotFirstInicio(
  user?: Omit<User, "password"> | null
): boolean {
  return isCooperadoMobilePilotPerfActive(user);
}

/** UI leve + snapshots de entregas no piloto (mobile, sem afetar outros PWA). */
export function cooperadoMobilePilotEntregasLeveUi(
  user?: Omit<User, "password"> | null
): boolean {
  if (!isCooperadoMobilePilotPerfActive(user)) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

/** Virtualiza lista de entregas do mês com limiar menor no piloto. */
export function cooperadoMobilePilotEntregasVirtualizeMinRows(
  user?: Omit<User, "password"> | null
): number {
  return isCooperadoMobilePilotPerfActive(user) ? 8 : Number.POSITIVE_INFINITY;
}

export function cooperadoMobilePilotPostEnvioForegroundSync(
  user?: Omit<User, "password"> | null
): boolean {
  return isCooperadoMobilePilotPerfActive(user);
}

/**
 * Adia parse pesado no 1º frame — card usa persistido/leitura rápida até o idle warm.
 */
export function cooperadoMobilePilotDeferAppDataEagerWarm(
  user?: Omit<User, "password"> | null
): boolean {
  if (isCooperadoPwaMessengerMode()) return true;
  return isCooperadoMobilePilotPerfActive(user);
}

/** Entregas leve: PWA GA ou piloto Jeferson mobile. */
export function cooperadoCooperadoEntregasLeveUiForUser(
  user?: Omit<User, "password"> | null
): boolean {
  return isCooperadoPwaMobileEntregasLeve() || cooperadoMobilePilotEntregasLeveUi(user);
}
