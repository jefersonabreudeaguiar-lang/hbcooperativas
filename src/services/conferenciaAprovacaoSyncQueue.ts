/**
 * H8.9.235 — Fila FIFO in-memory para sync pós-aprovação (Conferir entregas).
 * Serializa patch + push operacional sem bloquear a UI.
 */

export type ConferenciaAprovacaoSyncTask = () => Promise<void>;

let tail: Promise<void> = Promise.resolve();

/** Notas cujo PATCH já concluiu na fila — elegíveis no push operacional scoped. */
const patchSyncedForOperacionalPush = new Set<string>();

export function markConferenciaPatchSyncedForOperacionalPush(notaId: string): void {
  patchSyncedForOperacionalPush.add(notaId);
}

export function getConferenciaPatchSyncedSnapshot(): ReadonlySet<string> {
  return new Set(patchSyncedForOperacionalPush);
}

/** Somente testes. */
export function resetConferenciaPatchSyncedForTests(): void {
  patchSyncedForOperacionalPush.clear();
}

function logSyncFailure(notaId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn("[conferencia-aprovacao-sync]", notaId, msg);
}

/**
 * Enfileira sync (FIFO). Retorna promise da tarefa (para testes/diagnóstico).
 * A UI de conferência avança a fila logo após persistir localmente; a nuvem segue nesta fila.
 */
export function enqueueConferenciaAprovacaoSync(
  notaId: string,
  task: ConferenciaAprovacaoSyncTask
): Promise<void> {
  const run = tail.then(async () => {
    try {
      await task();
    } catch (err) {
      logSyncFailure(notaId, err);
      throw err;
    }
  });

  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Rejeição usa a mesma fila FIFO que aprovação (PATCH serializado). */
export const enqueueConferenciaRejeicaoSync = enqueueConferenciaAprovacaoSync;

/** Somente testes — aguarda esvaziar a fila. */
export function awaitConferenciaAprovacaoSyncQueueIdle(): Promise<void> {
  return tail;
}

/** Somente testes — zera fila. */
export function resetConferenciaAprovacaoSyncQueueForTests(): void {
  tail = Promise.resolve();
  patchSyncedForOperacionalPush.clear();
}
