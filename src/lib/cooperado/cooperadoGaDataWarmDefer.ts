/**
 * Celular GA: bloqueia `getData()` → `preloadAppData` na abertura (Chrome OOM / tela travada).
 * Liberado após «Atualizar» ou após uma janela curta de estabilização da tela.
 */
import {
  cooperadoGaMobileViewportAtivoLite,
  readCooperadoSessionLite,
} from "@/lib/cooperado/cooperadoSessionLite";
import { COOPERADO_INICIO_ABERTURA_QUIET_MS_MOBILE_GA } from "@/lib/cooperado/cooperadoInicioAberturaQuiescence";

const SESSION_UNLOCK_KEY = "hb.coop.gaDataWarmUnlocked.v1";
const DEFER_UNTIL_KEY = "hb.coop.gaDataWarmDeferUntil.v1";

/** Margem curta após quiescência para começar a aquecer os dados locais. */
export const COOPERADO_GA_MOBILE_DATA_WARM_DEFER_MS =
  COOPERADO_INICIO_ABERTURA_QUIET_MS_MOBILE_GA + 5_000;

function sessionUnlocked(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function readDeferUntil(): number {
  if (typeof sessionStorage === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(DEFER_UNTIL_KEY) ?? "0");
  } catch {
    return 0;
  }
}

/** Uma vez por abertura do app no celular cooperado. */
export function armCooperadoGaMobileDataWarmDefer(
  ms = COOPERADO_GA_MOBILE_DATA_WARM_DEFER_MS
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const until = readDeferUntil();
    if (Number.isFinite(until) && until > Date.now()) return;
    sessionStorage.setItem(DEFER_UNTIL_KEY, String(Date.now() + ms));
  } catch {
    /* quota */
  }
}

export function unlockCooperadoGaDataWarmForSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
    sessionStorage.removeItem(DEFER_UNTIL_KEY);
  } catch {
    /* quota */
  }
}

export function cooperadoGaShouldDeferDataWarmFromGetData(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionUnlocked()) return false;
  const session = readCooperadoSessionLite();
  if (!session || session.role !== "cooperado") return false;
  if (!cooperadoGaMobileViewportAtivoLite()) return false;
  const until = readDeferUntil();
  if (Number.isFinite(until) && until > 0 && Date.now() < until) return true;
  return false;
}

/** @internal testes */
export function resetCooperadoGaDataWarmDeferForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    sessionStorage.removeItem(DEFER_UNTIL_KEY);
  } catch {
    /* ignore */
  }
}
