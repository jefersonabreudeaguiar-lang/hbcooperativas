import type { User } from "@/types";
import {
  isCooperadoJefersonSomenteAtualizarPilot,
  withCooperadoJefersonAutoAtualizarPermitidoAsync,
} from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { yieldCooperadoMobileUiBeforeHeavyWork } from "@/lib/cooperado/cooperadoGaMobileAtualizarYield";
import { executarCooperadoAtualizarManual } from "@/lib/cooperado/cooperadoAtualizarManual";

/** Segunda «entrada» só após este intervalo desde a primeira (piloto Jeferson). */
export const COOPERADO_JEFERSON_DUPLA_ENTRADA_MIN_MS = 30_000;

/** Depois de liberado, não repetir auto-atualizar antes deste intervalo. */
export const COOPERADO_JEFERSON_AUTO_ATUALIZAR_MIN_INTERVAL_MS = 45_000;

const STORAGE_PREFIX = "hb.coop.jefersonDuplaEntrada.v2";

type DuplaEntradaState = {
  firstAt: number;
  entradas: number;
  unlocked: boolean;
  lastAutoAt: number;
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readState(userId: string): DuplaEntradaState {
  if (typeof sessionStorage === "undefined") {
    return { firstAt: 0, entradas: 0, unlocked: false, lastAutoAt: 0 };
  }
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return { firstAt: 0, entradas: 0, unlocked: false, lastAutoAt: 0 };
    const parsed = JSON.parse(raw) as DuplaEntradaState;
    return {
      firstAt: Number(parsed.firstAt) || 0,
      entradas: Number(parsed.entradas) || 0,
      unlocked: Boolean(parsed.unlocked),
      lastAutoAt: Number(parsed.lastAutoAt) || 0,
    };
  } catch {
    return { firstAt: 0, entradas: 0, unlocked: false, lastAutoAt: 0 };
  }
}

function writeState(userId: string, state: DuplaEntradaState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function cooperadoJefersonDuplaEntradaDesbloqueado(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user?.id || !isCooperadoJefersonSomenteAtualizarPilot(user)) return false;
  return readState(user.id).unlocked;
}

/** Registra volta ao app (visible) e dispara sync automático quando a regra de 2 entradas / 30s passar. */
export function registrarCooperadoJefersonForegroundEntrada(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user?.id || !isCooperadoJefersonSomenteAtualizarPilot(user)) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  const now = Date.now();
  const state = readState(user.id);

  if (state.entradas === 0) {
    writeState(user.id, { firstAt: now, entradas: 1, unlocked: state.unlocked, lastAutoAt: state.lastAutoAt });
    return;
  }

  const entradas = state.entradas + 1;
  const next: DuplaEntradaState = { ...state, entradas };

  if (!state.unlocked && entradas >= 2 && now - state.firstAt >= COOPERADO_JEFERSON_DUPLA_ENTRADA_MIN_MS) {
    next.unlocked = true;
    writeState(user.id, next);
    scheduleCooperadoJefersonAutoAtualizar(user, { motivo: "dupla_entrada" });
    return;
  }

  writeState(user.id, next);

  if (
    state.unlocked &&
    (state.lastAutoAt === 0 || now - state.lastAutoAt >= COOPERADO_JEFERSON_AUTO_ATUALIZAR_MIN_INTERVAL_MS)
  ) {
    scheduleCooperadoJefersonAutoAtualizar(user, { motivo: "entrada_liberada" });
  }
}

let autoInflight = false;

export function scheduleCooperadoJefersonAutoAtualizar(
  user: Omit<User, "password"> | null | undefined,
  _opts?: { motivo?: string }
): void {
  if (!user || !isCooperadoJefersonSomenteAtualizarPilot(user)) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (autoInflight) return;

  scheduleCooperadoPostInteractiveTask(() => {
    if (autoInflight) return;
    autoInflight = true;
    void withCooperadoJefersonAutoAtualizarPermitidoAsync(async () => {
      await yieldCooperadoMobileUiBeforeHeavyWork();
      await new Promise<void>((r) => {
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(() => r(), { timeout: 2_500 });
        } else {
          window.setTimeout(() => r(), 120);
        }
      });
      const ok = await executarCooperadoAtualizarManual();
      if (ok && user.id) {
        const st = readState(user.id);
        writeState(user.id, { ...st, lastAutoAt: Date.now() });
      }
    }).finally(() => {
      autoInflight = false;
    });
  });
}

/** @internal testes */
export function resetCooperadoJefersonDuplaEntradaForTests(userId?: string): void {
  if (typeof sessionStorage === "undefined") return;
  if (userId) {
    sessionStorage.removeItem(storageKey(userId));
    return;
  }
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
  }
}
