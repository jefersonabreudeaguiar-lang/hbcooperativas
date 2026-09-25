/** Coalesce in-flight aux syncs (ficha-descontos / sync-limite) — no change to financial rules. */

const inFlight = new Map<string, Promise<unknown>>();

export function coalesceContaCoopAuxSync<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function contaCoopAuxSyncKeyLimite(cnpj: string, cooperadoId: string): string {
  return `limite:${cnpj}:${cooperadoId}`;
}

export function contaCoopAuxSyncKeyValorReceber(cnpj: string, cooperadoId: string): string {
  return `valor:${cnpj}:${cooperadoId}`;
}

export function contaCoopAuxSyncKeyWarmupBundle(cnpj: string, userId: string): string {
  return `warmup:${cnpj}:${userId}`;
}
