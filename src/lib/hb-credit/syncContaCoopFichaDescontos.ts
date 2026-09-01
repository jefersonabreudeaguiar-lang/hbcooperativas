import type { AppData } from "@/types";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { fetchFichaDescontosContaCoop } from "@/services/creditApiService";
import { getData, updateData } from "@/services/dataStore";
import { persistDescontosContaCoopNoArquivo } from "@/services/notaPedidoService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

export type SyncContaCoopValorReceberOpts = {
  cnpj: string;
  cooperadoId: string;
  mesReferencia: string;
  cooperativaId: string;
  cooperadoNome?: string;
};

/** Busca compras Conta Coop na nuvem e grava no arquivo mensal local (abatimento do valor a receber). */
export async function syncContaCoopDescontosMesLocal(
  data: AppData,
  opts: {
    cnpj: string;
    cooperadoId: string;
    mesReferencia: string;
    cooperativaId: string;
  }
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  const descontos = await fetchFichaDescontosContaCoop(opts.cnpj, opts.cooperadoId, opts.mesReferencia);
  const next = persistDescontosContaCoopNoArquivo(
    data,
    opts.cooperadoId,
    opts.mesReferencia,
    opts.cooperativaId,
    descontos
  );
  return { data: next, descontos };
}

/** Sincroniza uso Conta Coop só no piloto (Orlando); demais cooperados não alteram valor a receber. */
export async function syncContaCoopDescontosMesSePilot(
  data: AppData,
  opts: SyncContaCoopValorReceberOpts
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  if (!isContaCoopValorReceberPilot(opts.cooperadoId, opts.cooperadoNome)) {
    return { data, descontos: [] };
  }
  return syncContaCoopDescontosMesLocal(data, opts);
}

/** Busca compras na nuvem, grava no arquivo mensal e atualiza o store local. */
export async function refreshContaCoopValorReceberPilot(
  opts: SyncContaCoopValorReceberOpts
): Promise<{ descontos: DescontoContaCoopRemoto[] }> {
  const synced = await syncContaCoopDescontosMesSePilot(getData(), opts);
  updateData(() => synced.data);
  return { descontos: synced.descontos };
}
