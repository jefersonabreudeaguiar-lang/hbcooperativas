/**
 * BIC como fonte principal de exibição no cooperado mobile —
 * materialização em idle, fora do fim do sync e fora da troca de aba.
 */
import { scheduleCooperadoBicHybridIdleTask } from "@/lib/cooperado/cooperadoBicHybridLight";
import { yieldCooperadoMobileUiBeforeHeavyWork } from "@/lib/cooperado/cooperadoGaMobileAtualizarYield";
import { cooperadoMobileUiQuiescenceActive } from "@/lib/cooperado/cooperadoTabSwitchQuiescence";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";

export type CooperadoBicMaterializacaoOpts = {
  idleTimeoutMs?: number;
  respectTabQuiescence?: boolean;
  quiescenceAttempts?: number;
};

const DEFAULT_IDLE_MS = 3_500;
const QUIESCENCE_RETRY_MS = 700;

export async function cooperadoBicAguardarUiProntaParaMaterializar(): Promise<boolean> {
  await yieldCooperadoMobileUiBeforeHeavyWork();
  if (typeof document !== "undefined" && document.hidden) return false;
  return true;
}

let bicMaterializacaoInflight = false;

/** Evita duas passadas BIC (card+ficha) no mesmo instante. */
export async function withCooperadoBicMaterializacaoSerializada<T>(
  fn: () => T | Promise<T>
): Promise<T | undefined> {
  if (bicMaterializacaoInflight) return undefined;
  bicMaterializacaoInflight = true;
  try {
    return await fn();
  } finally {
    bicMaterializacaoInflight = false;
  }
}

/** @internal testes */
export function resetCooperadoBicMaterializacaoInflightForTests(): void {
  bicMaterializacaoInflight = false;
}

/**
 * Agenda trabalho que lê BIC / grava snapshots — nunca no hot path do sync.
 */
export function scheduleCooperadoBicMaterializacaoProtegida(
  run: () => void | Promise<void>,
  opts?: CooperadoBicMaterializacaoOpts,
  attempt = 0
): void {
  const idleTimeout = opts?.idleTimeoutMs ?? DEFAULT_IDLE_MS;
  const respectQ = opts?.respectTabQuiescence ?? true;
  const maxAttempts = opts?.quiescenceAttempts ?? 12;

  scheduleCooperadoPostInteractiveTask(() => {
    const exec = async () => {
      if (respectQ && cooperadoMobileUiQuiescenceActive() && attempt < maxAttempts) {
        window.setTimeout(
          () => scheduleCooperadoBicMaterializacaoProtegida(run, opts, attempt + 1),
          QUIESCENCE_RETRY_MS
        );
        return;
      }
      const ok = await cooperadoBicAguardarUiProntaParaMaterializar();
      if (!ok) return;
      await withCooperadoBicMaterializacaoSerializada(run);
    };
    scheduleCooperadoBicHybridIdleTask(() => void exec(), idleTimeout);
  });
}
