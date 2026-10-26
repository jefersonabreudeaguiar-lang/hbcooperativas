/**
 * Celular GA: bloqueia `getData()` → `preloadAppData` na abertura (Chrome OOM).
 * Liberado após a janela de quiescência ou em sync iniciada pelo usuário («Atualizar»).
 */
import {
  cooperadoGaMobileViewportAtivoLite,
  readCooperadoSessionLite,
} from "@/lib/cooperado/cooperadoSessionLite";
import { cooperadoInicioAberturaQuiescenceActive } from "@/lib/cooperado/cooperadoInicioAberturaQuiescence";

const SESSION_UNLOCK_KEY = "hb.coop.gaDataWarmUnlocked.v1";

function sessionUnlocked(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockCooperadoGaDataWarmForSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
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
  return cooperadoInicioAberturaQuiescenceActive();
}

/** @internal testes */
export function resetCooperadoGaDataWarmDeferForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}
