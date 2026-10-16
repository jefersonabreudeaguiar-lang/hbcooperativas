/**
 * Concerto BIC — Movimento III: uma consulta de revisão por CNPJ por onda (coalesce in-flight).
 */
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { fetchCooperativaCloudRevision } from "@/services/cooperativaSyncRevisionService";
import { normalizeCnpj } from "@/utils/cooperativa";

const inflight = new Map<string, Promise<CooperativaCloudRevision | null>>();

export function watchBicCooperativaCloudRevision(
  cnpj: string
): Promise<CooperativaCloudRevision | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return Promise.resolve(null);

  const existing = inflight.get(digits);
  if (existing) return existing;

  const promise = fetchCooperativaCloudRevision(digits).finally(() => {
    inflight.delete(digits);
  });
  inflight.set(digits, promise);
  return promise;
}

/** Testes — limpa fila in-memory. */
export function resetBicRevisionWatchForTests(): void {
  inflight.clear();
}
