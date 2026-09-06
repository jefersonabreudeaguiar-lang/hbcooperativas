import type { AppData } from "@/types";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { dedupeDescontosContaCoopRemotos } from "@/lib/hb-credit/mergeFichaDescontos";
import { fetchFichaDescontosContaCoop } from "@/services/creditApiService";
import { listarMesesPendentesPagamentoResponsavel } from "@/services/cooperadoEntregasService";
import { beginSaveBatch, endSaveBatch, getData, updateData } from "@/services/dataStore";
import { persistDescontosContaCoopNoArquivo } from "@/services/notaPedidoService";

export type SyncContaCoopValorReceberOpts = {
  cnpj: string;
  cooperadoId: string;
  mesReferencia: string;
  cooperativaId: string;
  cooperadoNome?: string;
};

const SYNC_CONCURRENCY = 6;

/** Busca compras HB Créditos na nuvem e grava no arquivo mensal local (abatimento do valor a receber). */
export async function syncContaCoopDescontosMesLocal(
  data: AppData,
  opts: {
    cnpj: string;
    cooperadoId: string;
    mesReferencia: string;
    cooperativaId: string;
  }
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  const raw = await fetchFichaDescontosContaCoop(opts.cnpj, opts.cooperadoId, opts.mesReferencia);
  const descontos = dedupeDescontosContaCoopRemotos(raw);
  const next = persistDescontosContaCoopNoArquivo(
    data,
    opts.cooperadoId,
    opts.mesReferencia,
    opts.cooperativaId,
    descontos
  );
  return { data: next, descontos };
}

/** Sincroniza compras HB Créditos na nuvem → arquivo mensal local (abatimento do valor a receber). */
export async function syncContaCoopDescontosMesSePilot(
  data: AppData,
  opts: SyncContaCoopValorReceberOpts
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  return syncContaCoopDescontosMesLocal(data, opts);
}

function arquivosMensaisFingerprint(arquivos: AppData["arquivosMensais"]): string {
  return JSON.stringify(
    arquivos.map((a) => ({
      id: a.id,
      contaCoopDescontos: a.contaCoopDescontos,
    }))
  );
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      out[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/** Sincroniza meses em aberto de todos os cooperados da cooperativa (relatórios / responsável). */
export async function refreshContaCoopDescontosCooperativaPendentes(opts: {
  cnpj: string;
  cooperativaId: string;
  data?: AppData;
}): Promise<boolean> {
  const before = opts.data ?? getData();
  const beforeFp = arquivosMensaisFingerprint(before.arquivosMensais);
  let data = before;
  const cooperados = data.cooperados.filter(
    (c) => c.status === "ativo" && c.cooperativaId === opts.cooperativaId
  );

  const jobs: Array<{ cooperadoId: string; mesReferencia: string }> = [];
  for (const c of cooperados) {
    for (const mes of listarMesesPendentesPagamentoResponsavel(data, c.id, opts.cooperativaId)) {
      jobs.push({ cooperadoId: c.id, mesReferencia: mes });
    }
  }
  if (!jobs.length) return false;

  beginSaveBatch();
  try {
    const fetched = await mapPool(jobs, SYNC_CONCURRENCY, async (job) => {
      const descontos = dedupeDescontosContaCoopRemotos(
        await fetchFichaDescontosContaCoop(opts.cnpj, job.cooperadoId, job.mesReferencia)
      );
      return { ...job, descontos };
    });

    for (const row of fetched) {
      data = persistDescontosContaCoopNoArquivo(
        data,
        row.cooperadoId,
        row.mesReferencia,
        opts.cooperativaId,
        row.descontos
      );
    }

    const afterFp = arquivosMensaisFingerprint(data.arquivosMensais);
    if (afterFp !== beforeFp) {
      updateData(() => data);
      return true;
    }
    return false;
  } finally {
    endSaveBatch();
  }
}

/** Busca compras na nuvem, grava no arquivo mensal e atualiza o store local. */
export async function refreshContaCoopValorReceberPilot(
  opts: SyncContaCoopValorReceberOpts
): Promise<{ descontos: DescontoContaCoopRemoto[] }> {
  const before = getData();
  const beforeFp = arquivosMensaisFingerprint(before.arquivosMensais);
  const synced = await syncContaCoopDescontosMesSePilot(before, opts);
  const afterFp = arquivosMensaisFingerprint(synced.data.arquivosMensais);
  if (afterFp !== beforeFp) {
    updateData(() => synced.data);
  }
  return { descontos: synced.descontos };
}
