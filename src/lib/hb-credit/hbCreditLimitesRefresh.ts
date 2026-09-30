/**
 * Responsável — sincroniza crédito-base (ficha/BIC) → nuvem → lista de limites.
 */
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { gravarHbCreditLimitesPersistidos } from "@/lib/hb-credit/hbCreditLimitesPersistencia";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { fetchCreditLimites } from "@/services/creditApiService";

export type RefreshHbCreditLimitesStaffOpts = {
  cnpj: string;
  cooperativaId: string;
  cooperadoIds: string[];
};

export type RefreshHbCreditLimitesStaffResult = {
  limites: ContaCoopLimiteCooperado[];
  creditosBaseAuthoritativeCents?: Record<string, number>;
};

export async function refreshHbCreditLimitesStaff(
  opts: RefreshHbCreditLimitesStaffOpts
): Promise<RefreshHbCreditLimitesStaffResult> {
  if (!opts.cnpj || !opts.cooperadoIds.length) return { limites: [] };

  await refreshContaCoopLimiteFromFicha({
    cnpj: opts.cnpj,
    cooperadoId: opts.cooperadoIds[0],
    cooperativaId: opts.cooperativaId,
    cooperadoIds: opts.cooperadoIds,
  });

  const payload = await fetchCreditLimites(opts.cnpj, {
    resyncInflated: true,
    cooperadoIds: opts.cooperadoIds,
  });
  gravarHbCreditLimitesPersistidos(opts.cnpj, payload.limites, payload.creditosBaseAuthoritativeCents);
  return payload;
}
