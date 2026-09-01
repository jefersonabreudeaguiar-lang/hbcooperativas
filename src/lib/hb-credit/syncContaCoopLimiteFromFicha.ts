import { buildCreditosBaseMap } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { syncCreditLimiteFromFicha } from "@/services/creditApiService";
import { getData } from "@/services/dataStore";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

export type SyncContaCoopLimiteOpts = {
  cnpj: string;
  cooperadoId: string;
  cooperativaId: string;
  cooperadoNome?: string;
  cooperadoIds?: string[];
};

/** Envia crédito base (entregas pendentes) para sincronizar limite na nuvem. */
export async function refreshContaCoopLimiteFromFicha(opts: SyncContaCoopLimiteOpts): Promise<void> {
  if (!opts.cooperadoIds?.length && !isContaCoopValorReceberPilot(opts.cooperadoId, opts.cooperadoNome)) {
    return;
  }

  const data = getData();
  const ids = opts.cooperadoIds?.length ? opts.cooperadoIds : [opts.cooperadoId];
  const creditosBaseCents = buildCreditosBaseMap(data, ids, opts.cooperativaId);

  await syncCreditLimiteFromFicha({
    cnpj: opts.cnpj,
    cooperadoIds: ids,
    creditosBaseCents,
  });
}
