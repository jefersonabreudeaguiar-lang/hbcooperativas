import type { AppData } from "@/types";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { fetchFichaDescontosContaCoop } from "@/services/creditApiService";
import { listarMesesPendentesPagamentoResponsavel } from "@/services/cooperadoEntregasService";
import { getData, updateData } from "@/services/dataStore";
import { persistDescontosContaCoopNoArquivo } from "@/services/notaPedidoService";

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

/** Sincroniza compras Conta Coop na nuvem → arquivo mensal local (abatimento do valor a receber). */
export async function syncContaCoopDescontosMesSePilot(
  data: AppData,
  opts: SyncContaCoopValorReceberOpts
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  return syncContaCoopDescontosMesLocal(data, opts);
}

/** Sincroniza meses em aberto de todos os cooperados da cooperativa (relatórios / responsável). */
export async function refreshContaCoopDescontosCooperativaPendentes(opts: {
  cnpj: string;
  cooperativaId: string;
  data?: AppData;
}): Promise<void> {
  let data = opts.data ?? getData();
  const cooperados = data.cooperados.filter(
    (c) => c.status === "ativo" && c.cooperativaId === opts.cooperativaId
  );
  for (const c of cooperados) {
    const meses = listarMesesPendentesPagamentoResponsavel(data, c.id, opts.cooperativaId);
    for (const mes of meses) {
      const synced = await syncContaCoopDescontosMesLocal(data, {
        cnpj: opts.cnpj,
        cooperadoId: c.id,
        mesReferencia: mes,
        cooperativaId: opts.cooperativaId,
      });
      data = synced.data;
    }
  }
  updateData(() => data);
}

/** Busca compras na nuvem, grava no arquivo mensal e atualiza o store local. */
export async function refreshContaCoopValorReceberPilot(
  opts: SyncContaCoopValorReceberOpts
): Promise<{ descontos: DescontoContaCoopRemoto[] }> {
  const synced = await syncContaCoopDescontosMesSePilot(getData(), opts);
  updateData(() => synced.data);
  return { descontos: synced.descontos };
}
