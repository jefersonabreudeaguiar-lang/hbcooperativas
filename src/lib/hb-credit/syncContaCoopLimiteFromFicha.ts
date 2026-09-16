import { buildCreditosBaseMap } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { syncCreditLimiteFromFicha } from "@/services/creditApiService";
import { getData } from "@/services/dataStore";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import type { AppData } from "@/types";

export type SyncContaCoopLimiteOpts = {
  cnpj: string;
  cooperadoId: string;
  cooperativaId: string;
  cooperadoNome?: string;
  cooperadoIds?: string[];
};

/** Envia crédito base (valor a receber pendente) para sincronizar limite na nuvem. */
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

/** Sincroniza limites HB de todos os cooperados ativos (responsável / pós-sync operacional). */
export async function refreshContaCoopLimiteCooperativaAtivos(opts: {
  cnpj: string;
  cooperativaId: string;
  data?: AppData;
}): Promise<void> {
  const data = opts.data ?? getData();
  const ids = data.cooperados
    .filter((c) => c.cooperativaId === opts.cooperativaId && c.status === "ativo")
    .map((c) => c.id);
  if (!ids.length) return;
  await refreshContaCoopLimiteFromFicha({
    cnpj: opts.cnpj,
    cooperadoId: ids[0],
    cooperativaId: opts.cooperativaId,
    cooperadoIds: ids,
  });
}
