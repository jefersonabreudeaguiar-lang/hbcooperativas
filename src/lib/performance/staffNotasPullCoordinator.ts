import { syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
import type { CooperativaSyncSessionLease } from "@/services/operacionalPullLease";
import { normalizeCnpj } from "@/utils/cooperativa";

const inflightByCnpj = new Map<string, Promise<number>>();

/**
 * U1 — um pull de notas por CNPJ (gestão). Evita tempestade entre runSync tier, fila e visibility.
 */
export function syncNotasPedidoFromCloudStaffCoalesced(
  cnpj: string,
  options?: { retryFull?: boolean; sessionLease?: CooperativaSyncSessionLease }
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return Promise.resolve(0);

  const existing = inflightByCnpj.get(digits);
  if (existing) return existing;

  const run = syncNotasPedidoFromCloud(digits, options).finally(() => {
    if (inflightByCnpj.get(digits) === run) {
      inflightByCnpj.delete(digits);
    }
  });
  inflightByCnpj.set(digits, run);
  return run;
}

/** Somente testes. */
export function resetStaffNotasPullCoordinatorForTests(): void {
  inflightByCnpj.clear();
}
