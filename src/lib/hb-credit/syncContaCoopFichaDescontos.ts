import type { AppData } from "@/types";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { dedupeDescontosContaCoopRemotos } from "@/lib/hb-credit/mergeFichaDescontos";
import { fetchFichaDescontosContaCoop } from "@/services/creditApiService";
import {
  listCooperadoIdsMesmoTitular,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import {
  getMesPrincipalQuantoVouReceber,
  listarMesesPendentesQuantoVouReceber,
  listarMesesPendentesPagamentoResponsavel,
} from "@/services/cooperadoEntregasService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { beginSaveBatch, endSaveBatch, getData, notifyAppDataSubscribers, updateData } from "@/services/dataStore";
import { persistDescontosContaCoopNoArquivo, getDescontosContaCoopMesCached, getResumoValorAPagarRelatorio } from "@/services/notaPedidoService";
import { setContaCoopDescontosMemoria } from "@/lib/hb-credit/contaCoopDescontosMemory";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import type { User } from "@/types";

export type SyncContaCoopValorReceberOpts = {
  cnpj: string;
  cooperadoId: string;
  mesReferencia: string;
  cooperativaId: string;
  cooperadoNome?: string;
};

type RefreshOpts = SyncContaCoopValorReceberOpts & {
  /** Envia arquivo mensal atualizado para a nuvem (responsável / outros aparelhos). */
  pushCloud?: boolean;
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
    cooperadoNome?: string;
  }
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  const canonico = resolverCooperadoIdCanonico(
    data,
    opts.cooperadoId,
    opts.cooperativaId,
    opts.cooperadoNome
  );
  const titularIds = listCooperadoIdsMesmoTitular(data, canonico, opts.cooperativaId);
  const raw = await fetchFichaDescontosContaCoop(opts.cnpj, titularIds, opts.mesReferencia);
  const descontos = dedupeDescontosContaCoopRemotos(raw);
  setContaCoopDescontosMemoria(opts.cooperativaId, canonico, opts.mesReferencia, descontos);
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

function mesesReferenciaParaSyncCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesFallback: string
): string[] {
  const meses = listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
  if (meses.length) return [...meses].sort();
  if (mesFallback) return [mesFallback];
  return [getMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId)];
}

async function syncContaCoopDescontosMesesLocal(
  data: AppData,
  opts: SyncContaCoopValorReceberOpts,
  meses: string[]
): Promise<{ data: AppData; descontos: DescontoContaCoopRemoto[] }> {
  let next = data;
  let descontos: DescontoContaCoopRemoto[] = [];
  for (const mesReferencia of [...new Set(meses)].sort()) {
    const synced = await syncContaCoopDescontosMesLocal(next, { ...opts, mesReferencia });
    next = synced.data;
    descontos = synced.descontos;
  }
  return { data: next, descontos };
}

function descontosHbFingerprint(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  meses: string[]
): string {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  return [...new Set(meses)]
    .sort()
    .map((mes) =>
      JSON.stringify(getDescontosContaCoopMesCached(data, canonico, mes, cooperativaId))
    )
    .join("|");
}

function valorReceberHbFingerprint(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  meses: string[]
): string {
  return [...new Set(meses)]
    .sort()
    .map((mes) => getResumoValorAPagarRelatorio(data, cooperadoId, mes, cooperativaId).valorLiquido.toFixed(2))
    .join("|");
}

async function applyLocalContaCoopDescontosRefresh(
  opts: RefreshOpts
): Promise<{ changed: boolean; descontos: DescontoContaCoopRemoto[]; data: AppData }> {
  const before = getData();
  const beforeFp = arquivosMensaisFingerprint(before.arquivosMensais);
  const meses = mesesReferenciaParaSyncCooperado(before, opts.cooperadoId, opts.cooperativaId, opts.mesReferencia);
  const beforeDescontosFp = descontosHbFingerprint(before, opts.cooperadoId, opts.cooperativaId, meses);
  const beforeValorFp = valorReceberHbFingerprint(before, opts.cooperadoId, opts.cooperativaId, meses);
  const synced = await syncContaCoopDescontosMesesLocal(before, opts, meses);
  const afterFp = arquivosMensaisFingerprint(synced.data.arquivosMensais);
  const afterDescontosFp = descontosHbFingerprint(synced.data, opts.cooperadoId, opts.cooperativaId, meses);
  const afterValorFp = valorReceberHbFingerprint(synced.data, opts.cooperadoId, opts.cooperativaId, meses);
  const changed = afterFp !== beforeFp;
  const financeChanged = beforeDescontosFp !== afterDescontosFp || beforeValorFp !== afterValorFp;
  if (changed) {
    updateData(() => synced.data);
  } else if (financeChanged) {
    notifyAppDataSubscribers();
  }
  return { changed, descontos: synced.descontos, data: synced.data };
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
  pushCloud?: boolean;
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
      const titularIds = listCooperadoIdsMesmoTitular(before, job.cooperadoId, opts.cooperativaId);
      const descontos = dedupeDescontosContaCoopRemotos(
        await fetchFichaDescontosContaCoop(opts.cnpj, titularIds, job.mesReferencia)
      );
      return { ...job, descontos };
    });

    for (const row of fetched) {
      const canonico = resolverCooperadoIdCanonico(before, row.cooperadoId, opts.cooperativaId);
      setContaCoopDescontosMemoria(opts.cooperativaId, canonico, row.mesReferencia, row.descontos);
      data = persistDescontosContaCoopNoArquivo(
        data,
        row.cooperadoId,
        row.mesReferencia,
        opts.cooperativaId,
        row.descontos
      );
    }

    const afterFp = arquivosMensaisFingerprint(data.arquivosMensais);
    const anyDescontos = fetched.some((row) => row.descontos.length > 0);
    if (afterFp !== beforeFp) {
      updateData(() => data);
      if (opts.pushCloud !== false) {
        await pushOperacionalToCloud(opts.cnpj, data, opts.cooperativaId).catch(() => {});
      }
      return true;
    }
    if (anyDescontos) {
      notifyAppDataSubscribers();
    }
    return false;
  } finally {
    endSaveBatch();
  }
}

/** Atualiza arquivo mensal local a partir das transações HB na nuvem (polling / telas abertas). */
export async function refreshContaCoopValorReceberPilot(
  opts: SyncContaCoopValorReceberOpts
): Promise<{ descontos: DescontoContaCoopRemoto[] }> {
  const { descontos } = await applyLocalContaCoopDescontosRefresh({ ...opts, pushCloud: false });
  return { descontos };
}

/**
 * Imediatamente após pagamento ou estorno HB Créditos — abate valor a receber e linhas do resumo.
 * Sincroniza todos os meses em aberto do cooperado e envia operacional à nuvem.
 */
export async function refreshContaCoopValorReceberAfterHbTransaction(
  opts: SyncContaCoopValorReceberOpts
): Promise<{ descontos: DescontoContaCoopRemoto[] }> {
  const { changed, descontos, data } = await applyLocalContaCoopDescontosRefresh({
    ...opts,
    pushCloud: true,
  });
  if (changed) {
    await pushOperacionalToCloud(opts.cnpj, data, opts.cooperativaId).catch(() => {});
  }
  return { descontos };
}

/**
 * Após sincronizar operacional com a nuvem — recarrega compras HB da Supabase
 * (fonte da verdade) para arquivo mensal local, valor a receber e resumo.
 */
export async function refreshContaCoopDescontosAfterOperacionalSync(opts: {
  cnpj: string;
  cooperativaId: string;
  user: Pick<User, "role" | "cooperadoId">;
}): Promise<void> {
  if (!isContaCoopValorReceberPilot()) return;

  const data = getData();
  if (opts.user.role === "cooperado" && opts.user.cooperadoId) {
    const canonico = resolverCooperadoIdCanonico(data, opts.user.cooperadoId, opts.cooperativaId);
    const mesReferencia = getMesPrincipalQuantoVouReceber(data, canonico, opts.cooperativaId);
    await refreshContaCoopValorReceberPilot({
      cnpj: opts.cnpj,
      cooperadoId: canonico,
      mesReferencia,
      cooperativaId: opts.cooperativaId,
    }).catch(() => {});
    return;
  }

  if (opts.user.role === "responsavel" || opts.user.role === "tesoureiro" || opts.user.role === "admin") {
    await refreshContaCoopDescontosCooperativaPendentes({
      cnpj: opts.cnpj,
      cooperativaId: opts.cooperativaId,
      pushCloud: true,
    }).catch(() => {});
  }
}
