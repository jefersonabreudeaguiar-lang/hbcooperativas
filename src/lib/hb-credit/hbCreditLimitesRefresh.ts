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

export async function refreshHbCreditLimitesStaff(
  opts: RefreshHbCreditLimitesStaffOpts
): Promise<ContaCoopLimiteCooperado[]> {
  if (!opts.cnpj || !opts.cooperadoIds.length) return [];

  await refreshContaCoopLimiteFromFicha({
    cnpj: opts.cnpj,
    cooperadoId: opts.cooperadoIds[0],
    cooperativaId: opts.cooperativaId,
    cooperadoIds: opts.cooperadoIds,
  });

  const limites = await fetchCreditLimites(opts.cnpj);
  gravarHbCreditLimitesPersistidos(opts.cnpj, limites);
  return limites;
}
