import type { AppData } from "@/types";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { fetchFichaDescontosContaCoop } from "@/services/creditApiService";
import { persistDescontosContaCoopNoArquivo } from "@/services/notaPedidoService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

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
  opts: {
    cnpj: string;
    cooperadoId: string;
    mesReferencia: string;
    cooperativaId: string;
    cooperadoNome?: string;
  }
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  if (!isContaCoopValorReceberPilot(opts.cooperadoId, opts.cooperadoNome)) {
    return { data, descontos: [] };
  }
  return syncContaCoopDescontosMesLocal(data, opts);
}
