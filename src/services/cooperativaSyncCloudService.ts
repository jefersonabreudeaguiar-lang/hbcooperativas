import type { AppData, Cooperativa, Cooperado, Instituicao, ProdutoInstituicao, Desconto, PrestacaoContasExcluida, InstituicaoExcluida } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { getData, saveDataSafe } from "@/services/dataStore";
import { syncCooperadosFromCloud, fetchCooperadosFromCloud, pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { syncNotasPedidoFromCloud, patchNotaPedidoInCloud } from "@/services/notaPedidoCloudService";
import { fetchCooperativaByCnpjFromCloud, mergeCooperativaIntoData } from "@/services/cooperativaCloudService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { sincronizarMensalidadeCooperativa, mensalidadeVisivelNoDispositivo, normalizarMensalidadeCooperadoLocal, mesclarMensalidadesPayloadNuvem, prepararMensalidadesCloud, prepararMensalidadeCloud, reconciliarMensalidadesComCooperadosCloud, mensalidadeCloudEntraNoDispositivo, enriquecerMensalidadeCooperadoSnapshot } from "@/services/mensalidadeService";
import { aplicarPrestacoesContasExcluidas } from "@/services/prestacaoContasService";
import { aplicarInstituicoesExcluidas } from "@/services/instituicaoContratoService";
import {
  OPERATIONAL_RESET_VERSION,
  needsOperationalResetCloudPush,
  markOperationalResetCloudDone,
} from "@/services/operationalReset";
type WithUpdatedAt = { id: string; updatedAt?: string; createdAt?: string };

function itemTime(item: WithUpdatedAt): number {
  const t = item.updatedAt ?? item.createdAt;
  return t ? new Date(t).getTime() : 0;
}

/** Mescla listas pelo id, mantendo o registro mais recente. */
export function mergeArrayByNewer<T extends WithUpdatedAt>(local: T[], cloud: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    if (!cur || itemTime(item) >= itemTime(cur)) map.set(item.id, item);
  }
  return [...map.values()];
}

/** Nuvem é a lista canônica; local só permanece se for mais novo que o snapshot da nuvem (exclusões propagam). */
function mergeOperacionalArrayFromCloud<T extends WithUpdatedAt>(
  localCoop: T[],
  cloudItems: T[],
  cloudUpdatedAt: string | undefined
): T[] {
  const cloudTime = cloudUpdatedAt ? new Date(cloudUpdatedAt).getTime() : 0;
  const cloudIds = new Set(cloudItems.map((i) => i.id));
  const map = new Map<string, T>();

  for (const item of cloudItems) map.set(item.id, item);

  for (const item of localCoop) {
    if (cloudIds.has(item.id)) continue;
    if (cloudTime > 0 && itemTime(item) <= cloudTime) continue;
    map.set(item.id, item);
  }

  return [...map.values()];
}

function mergePrestacoesExcluidasByNewer(
  local: PrestacaoContasExcluida[],
  cloud: PrestacaoContasExcluida[]
): PrestacaoContasExcluida[] {
  const map = new Map<string, PrestacaoContasExcluida>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    const tItem = new Date(item.deletedAt).getTime();
    const tCur = cur ? new Date(cur.deletedAt).getTime() : 0;
    if (!cur || tItem >= tCur) map.set(item.id, item);
  }
  return [...map.values()];
}

function mergeInstituicoesExcluidasByNewer(
  local: InstituicaoExcluida[],
  cloud: InstituicaoExcluida[]
): InstituicaoExcluida[] {
  const map = new Map<string, InstituicaoExcluida>();
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    const tItem = new Date(item.deletedAt).getTime();
    const tCur = cur ? new Date(cur.deletedAt).getTime() : 0;
    if (!cur || tItem >= tCur) map.set(item.id, item);
  }
  return [...map.values()];
}

function resolveCoopId(data: AppData, cnpj: string): string | undefined {
  const digits = normalizeCnpj(cnpj);
  return data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === digits)?.id;
}

function buildContratosPayload(data: AppData, coopId: string): ContratosSyncPayload {
  const now = new Date().toISOString();
  const excluidasIds = new Set(
    (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId).map((e) => e.id)
  );
  return {
    updatedAt: now,
    instituicoes: data.instituicoes.filter((i) => i.cooperativaId === coopId && !excluidasIds.has(i.id)),
    produtosInstituicao: data.produtosInstituicao.filter(
      (p) => p.cooperativaId === coopId && !excluidasIds.has(p.instituicaoId)
    ),
    instituicoesExcluidas: (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cronogramasContrato: (data.cronogramasContrato ?? []).filter((c) => c.cooperativaId === coopId),
  };
}

function buildOperacionalPayload(data: AppData, coopId: string): OperacionalSyncPayload {
  const now = new Date().toISOString();
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));
  const excluidasIds = new Set(
    (data.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId).map((e) => e.id)
  );
  return {
    updatedAt: now,
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
    ajustesFichaMes: (data.ajustesFichaMes ?? []).filter((a) => a.cooperativaId === coopId),
    pagamentosCooperado: data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId),
    comunicados: data.comunicados.filter((c) => c.cooperativaId === coopId),
    mensalidades: data.mensalidades
      .filter((m) => mensalidadeVisivelNoDispositivo(data, m, coopId))
      .map((m) =>
        enriquecerMensalidadeCooperadoSnapshot(
          data,
          normalizarMensalidadeCooperadoLocal(data, m, coopId),
          coopId
        )
      ),
    descontos: data.descontos.filter((d) => cooperadoIds.has(d.cooperadoId)),
    valoresAvulsosReceber: (data.valoresAvulsosReceber ?? []).filter((v) => v.cooperativaId === coopId),
    livroCaixa: (data.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId),
    prestacoesContas: (data.prestacoesContas ?? []).filter(
      (p) => p.cooperativaId === coopId && !excluidasIds.has(p.id)
    ),
    prestacoesContasExcluidas: (data.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    config: { ...data.config },
  };
}

function normalizeCloudOperacional(cloud: OperacionalSyncPayload): OperacionalSyncPayload {
  if ((cloud.operationalResetVersion ?? 0) >= OPERATIONAL_RESET_VERSION) return cloud;
  return {
    ...cloud,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
  };
}

function buildEmptyOperacionalResetPayload(data: AppData, coopId: string): OperacionalSyncPayload {
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));
  const mensalidadesCoop = data.mensalidades.filter((m) => cooperadoIds.has(m.cooperadoId));
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    fullReset: true,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: mensalidadesCoop,
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    config: { ...data.config },
  };
}

export async function pushOperationalResetToCloud(cnpj: string, coopId?: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  const payload = buildEmptyOperacionalResetPayload(d, cid);
  try {
    await fetch("/api/cooperativa-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, section: "operacional", payload }),
    });
    markOperationalResetCloudDone();
  } catch {
    /* tenta de novo no próximo ciclo */
  }
}

function normalizeInstNome(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Une instituições com o mesmo nome e remapeia produtos para o id canônico. */
function reconcileInstituicoesProdutos(
  instituicoes: Instituicao[],
  produtos: ProdutoInstituicao[]
): { instituicoes: Instituicao[]; produtos: ProdutoInstituicao[] } {
  const instIdRemap = new Map<string, string>();
  const byName = new Map<string, Instituicao>();
  const produtosAtivos = (instId: string) =>
    produtos.filter((p) => p.instituicaoId === instId && p.ativo).length;

  for (const inst of instituicoes) {
    const key = normalizeInstNome(inst.nome);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, inst);
      continue;
    }
    const keep = produtosAtivos(inst.id) > produtosAtivos(existing.id) ? inst : existing;
    const drop = keep.id === inst.id ? existing : inst;
    instIdRemap.set(drop.id, keep.id);
    byName.set(key, keep);
  }

  const finalInst = [...byName.values()];
  const finalProd = produtos.map((p) => ({
    ...p,
    instituicaoId: instIdRemap.get(p.instituicaoId) ?? p.instituicaoId,
  }));

  return { instituicoes: finalInst, produtos: finalProd };
}

function mergeCatalogProducts(local: ProdutoInstituicao[], cloud: ProdutoInstituicao[]): ProdutoInstituicao[] {
  const merged = mergeArrayByNewer(local, cloud);

  const byNomeInst = new Map<string, ProdutoInstituicao>();
  for (const p of merged) {
    if (!p.ativo || p.precoUnitario <= 0) continue;
    const key = `${p.instituicaoId}::${normalizeInstNome(p.nome)}`;
    const cur = byNomeInst.get(key);
    if (!cur || itemTime(p) >= itemTime(cur)) byNomeInst.set(key, p);
  }

  const winningActiveIds = new Set([...byNomeInst.values()].map((p) => p.id));
  const inactive = merged.filter((p) => !p.ativo || p.precoUnitario <= 0);
  const activeWinners = merged.filter(
    (p) => p.ativo && p.precoUnitario > 0 && winningActiveIds.has(p.id)
  );

  if (activeWinners.length === 0) return merged;
  return [...inactive, ...activeWinners];
}

/** Cooperado só exibe o catálogo publicado pelo responsável na nuvem. */
function alinharCatalogoComNuvem(
  instituicoes: Instituicao[],
  produtos: ProdutoInstituicao[],
  cloudInst: Instituicao[],
  cloudProd: ProdutoInstituicao[],
  coopId: string
): { instituicoes: Instituicao[]; produtos: ProdutoInstituicao[] } {
  const cloudItensAtivos = cloudProd.filter((p) => p.ativo && p.precoUnitario > 0).length;
  if (cloudInst.length === 0 && cloudItensAtivos === 0) {
    return { instituicoes, produtos };
  }

  const cloudInstIds = new Set(cloudInst.map((i) => i.id));
  const cloudActive = cloudProd.filter((p) => p.ativo && p.precoUnitario > 0);
  const cloudProdIds = new Set(cloudActive.map((p) => p.id));
  const cloudProdKeys = new Set(
    cloudActive.map((p) => `${p.instituicaoId}::${normalizeInstNome(p.nome)}`)
  );

  const cloudInstComItens = new Set(cloudActive.map((p) => p.instituicaoId));

  const instituicoesAlinhadas = instituicoes.filter((i) => {
    if (i.cooperativaId !== coopId) return true;
    if (!cloudInstIds.has(i.id)) return false;
    if (cloudItensAtivos > 0 && !cloudInstComItens.has(i.id)) return false;
    return true;
  });

  const now = new Date().toISOString();
  const produtosAlinhados = produtos.map((p) => {
    if (p.cooperativaId !== coopId) return p;
    if (!p.ativo || p.precoUnitario <= 0) return p;
    if (cloudProdIds.has(p.id)) return p;
    const key = `${p.instituicaoId}::${normalizeInstNome(p.nome)}`;
    if (cloudProdKeys.has(key)) return p;
    return { ...p, ativo: false, updatedAt: now };
  });

  return { instituicoes: instituicoesAlinhadas, produtos: produtosAlinhados };
}

export function mergeContratosIntoData(data: AppData, cloud: ContratosSyncPayload, coopId: string): AppData {
  const cloudExcluidas = (cloud.instituicoesExcluidas ?? []).map((e) => ({ ...e, cooperativaId: coopId }));
  const mergedExcluidasCoop = mergeInstituicoesExcluidasByNewer(
    (data.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidas
  );
  const excluidasIds = new Set(mergedExcluidasCoop.map((e) => e.id));

  const localInst = data.instituicoes.filter((i) => i.cooperativaId !== coopId);
  const localProd = data.produtosInstituicao.filter((p) => p.cooperativaId !== coopId);

  const cloudInst = cloud.instituicoes
    .map((i) => ({ ...i, cooperativaId: coopId }))
    .filter((i) => !excluidasIds.has(i.id));
  const cloudProd = cloud.produtosInstituicao
    .map((p) => ({ ...p, cooperativaId: coopId }))
    .filter((p) => !excluidasIds.has(p.instituicaoId));
  const cloudItensAtivos = cloudProd.filter((p) => p.ativo && p.precoUnitario > 0).length;

  const localInstCoop = data.instituicoes.filter(
    (i) => i.cooperativaId === coopId && !excluidasIds.has(i.id)
  );
  const localProdCoop = data.produtosInstituicao.filter(
    (p) => p.cooperativaId === coopId && !excluidasIds.has(p.instituicaoId)
  );
  const localCronCoop = (data.cronogramasContrato ?? []).filter((c) => c.cooperativaId === coopId);
  const cloudCron = (cloud.cronogramasContrato ?? [])
    .map((c) => ({ ...c, cooperativaId: coopId }))
    .filter((c) => !excluidasIds.has(c.instituicaoId));

  const localInstIds = new Set(localInstCoop.map((i) => i.id));
  const cloudInstFiltered = cloudInst.filter((i) => {
    if (localInstIds.has(i.id)) return true;
    return cloudProd.some((p) => p.instituicaoId === i.id && p.ativo && p.precoUnitario > 0);
  });

  const mergedInst = mergeArrayByNewer(localInstCoop, cloudInstFiltered);
  const mergedProd =
    cloudItensAtivos > 0
      ? mergeCatalogProducts(localProdCoop, cloudProd)
      : mergeArrayByNewer(localProdCoop, cloudProd);

  const reconciled = reconcileInstituicoesProdutos(mergedInst, mergedProd);
  const alinhado = alinharCatalogoComNuvem(
    reconciled.instituicoes,
    reconciled.produtos,
    cloudInst,
    cloudProd,
    coopId
  );

  const instIdsValidos = new Set(
    alinhado.produtos
      .filter((p) => p.cooperativaId === coopId && p.ativo && p.precoUnitario > 0)
      .map((p) => p.instituicaoId)
  );
  const instituicoesPublicadas =
    cloudItensAtivos > 0
      ? alinhado.instituicoes.filter(
          (i) => i.cooperativaId !== coopId || instIdsValidos.has(i.id)
        )
      : alinhado.instituicoes;

  const filterCoop = <T extends { cooperativaId?: string }>(items: T[]) =>
    items.filter((i) => i.cooperativaId !== coopId);

  return aplicarInstituicoesExcluidas({
    ...data,
    instituicoes: [...localInst, ...instituicoesPublicadas],
    produtosInstituicao: [...localProd, ...alinhado.produtos],
    cronogramasContrato: [
      ...(data.cronogramasContrato ?? []).filter((c) => c.cooperativaId !== coopId),
      ...mergeArrayByNewer(localCronCoop, cloudCron),
    ],
    instituicoesExcluidas: [
      ...filterCoop(data.instituicoesExcluidas ?? []),
      ...mergedExcluidasCoop,
    ],
  });
}

export function mergeOperacionalIntoData(
  data: AppData,
  cloud: OperacionalSyncPayload,
  coopId: string,
  cloudCooperados: Cooperado[] = []
): AppData {
  cloud = normalizeCloudOperacional(cloud);
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));

  const mensalidadesLocaisVisiveis = data.mensalidades
    .filter((m) => mensalidadeVisivelNoDispositivo(data, m, coopId))
    .map((m) => normalizarMensalidadeCooperadoLocal(data, m, coopId));
  const mensalidadesCloudVisiveis = (cloud.mensalidades ?? [])
    .filter((raw) => mensalidadeCloudEntraNoDispositivo(data, raw, coopId, cloudCooperados))
    .map((raw) => prepararMensalidadeCloud(data, raw, coopId, cloudCooperados));

  const cloudArquivos = cloud.arquivosMensais.map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudAjustes = (cloud.ajustesFichaMes ?? []).map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudPagamentos = cloud.pagamentosCooperado.map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudComunicados = cloud.comunicados.map((c) => ({ ...c, cooperativaId: coopId }));
  const cloudDescontos = (cloud.descontos ?? []).filter((d) => cooperadoIds.has(d.cooperadoId));
  const cloudAvulsos = (cloud.valoresAvulsosReceber ?? []).map((v) => ({ ...v, cooperativaId: coopId }));
  const cloudLivro = (cloud.livroCaixa ?? []).map((l) => ({ ...l, cooperativaId: coopId }));
  const cloudExcluidas = (cloud.prestacoesContasExcluidas ?? []).map((e) => ({ ...e, cooperativaId: coopId }));
  const mergedExcluidasCoop = mergePrestacoesExcluidasByNewer(
    (data.prestacoesContasExcluidas ?? []).filter((e) => e.cooperativaId === coopId),
    cloudExcluidas
  );
  const prestacoesExcluidasIds = new Set(mergedExcluidasCoop.map((e) => e.id));
  const cloudPrest = (cloud.prestacoesContas ?? [])
    .map((p) => ({ ...p, cooperativaId: coopId }))
    .filter((p) => !prestacoesExcluidasIds.has(p.id));
  const localPrestCoop = (data.prestacoesContas ?? [])
    .filter((p) => p.cooperativaId === coopId && !prestacoesExcluidasIds.has(p.id));

  const filterCoop = <T extends { cooperativaId?: string; cooperadoId?: string }>(
    items: T[],
    isCoop: (i: T) => boolean
  ) => items.filter((i) => !isCoop(i));

  const cloudSyncTime = cloud.updatedAt;

  let next: AppData = {
    ...data,
    arquivosMensais: [
      ...filterCoop(data.arquivosMensais, (a) => a.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(
        data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
        cloudArquivos,
        cloudSyncTime
      ),
    ],
    ajustesFichaMes: [
      ...filterCoop(data.ajustesFichaMes ?? [], (a) => a.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(
        (data.ajustesFichaMes ?? []).filter((a) => a.cooperativaId === coopId),
        cloudAjustes,
        cloudSyncTime
      ),
    ],
    pagamentosCooperado: [
      ...filterCoop(data.pagamentosCooperado, (p) => p.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(
        data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId),
        cloudPagamentos,
        cloudSyncTime
      ),
    ],
    comunicados: [
      ...filterCoop(data.comunicados, (c) => c.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(
        data.comunicados.filter((c) => c.cooperativaId === coopId),
        cloudComunicados,
        cloudSyncTime
      ),
    ],
    mensalidades: [
      ...data.mensalidades.filter((m) => !mensalidadeVisivelNoDispositivo(data, m, coopId)),
      ...(mensalidadesCloudVisiveis.length > 0
        ? mergeOperacionalArrayFromCloud(
            mensalidadesLocaisVisiveis,
            mensalidadesCloudVisiveis,
            cloudSyncTime
          )
        : mensalidadesLocaisVisiveis),
    ],
    descontos: [
      ...data.descontos.filter((d) => !cooperadoIds.has(d.cooperadoId)),
      ...mergeOperacionalArrayFromCloud(
        data.descontos.filter((d) => cooperadoIds.has(d.cooperadoId)),
        cloudDescontos,
        cloudSyncTime
      ),
    ],
    valoresAvulsosReceber: [
      ...filterCoop(data.valoresAvulsosReceber ?? [], (v) => v.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(
        (data.valoresAvulsosReceber ?? []).filter((v) => v.cooperativaId === coopId),
        cloudAvulsos,
        cloudSyncTime
      ),
    ],
    livroCaixa: [
      ...filterCoop(data.livroCaixa ?? [], (l) => l.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(
        (data.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId),
        cloudLivro,
        cloudSyncTime
      ),
    ],
    prestacoesContas: [
      ...filterCoop(data.prestacoesContas ?? [], (p) => p.cooperativaId === coopId),
      ...mergeOperacionalArrayFromCloud(localPrestCoop, cloudPrest, cloudSyncTime).filter(
        (p) => !prestacoesExcluidasIds.has(p.id)
      ),
    ],
    prestacoesContasExcluidas: [
      ...filterCoop(data.prestacoesContasExcluidas ?? [], (e) => e.cooperativaId === coopId),
      ...mergedExcluidasCoop,
    ],
  };

  const localConfigTime = new Date(data.cooperativas.find((c) => c.id === coopId)?.updatedAt ?? 0).getTime();
  const cloudConfigTime = new Date(cloud.updatedAt).getTime();
  if (cloudConfigTime >= localConfigTime && cloud.config) {
    next = { ...next, config: { ...next.config, ...cloud.config } };
  }

  next = reconciliarMensalidadesComCooperadosCloud(next, coopId, cloudCooperados);

  next = {
    ...next,
    mensalidades: next.mensalidades.map((m) => {
      if (!mensalidadeVisivelNoDispositivo(next, m, coopId)) return m;
      return enriquecerMensalidadeCooperadoSnapshot(
        next,
        prepararMensalidadeCloud(next, m, coopId, cloudCooperados),
        coopId
      );
    }),
  };

  return sincronizarMensalidadeCooperativa(
    aplicarPrestacoesContasExcluidas(reconciliarFichaFromNotasConferidas(next)),
    coopId
  );
}

async function fetchSyncBundle(cnpj: string): Promise<{
  contratos: ContratosSyncPayload | null;
  operacional: OperacionalSyncPayload | null;
} | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  try {
    const res = await fetch(`/api/cooperativa-sync?cnpj=${digits}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.configured) return null;
    return {
      contratos: json.contratos ?? null,
      operacional: json.operacional ?? null,
    };
  } catch {
    return null;
  }
}

export async function pushContratosToCloud(
  cnpj: string,
  data?: AppData,
  coopId?: string,
  options?: { localOnly?: boolean; authoritative?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = aplicarInstituicoesExcluidas(data ?? getData());
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  let merged = d;
  let bundle: Awaited<ReturnType<typeof fetchSyncBundle>> | null = null;
  const skipCloudMerge = options?.authoritative || options?.localOnly;
  if (!skipCloudMerge) {
    bundle = await fetchSyncBundle(digits);
    if (bundle?.contratos) {
      merged = aplicarInstituicoesExcluidas(mergeContratosIntoData(d, bundle.contratos, cid));
      saveDataSafe(merged);
    }
  } else {
    saveDataSafe(merged);
  }

  const payload = buildContratosPayload(merged, cid);
  if (!skipCloudMerge) {
    const localItensAtivos = payload.produtosInstituicao.filter((p) => p.ativo && p.precoUnitario > 0).length;
    const cloudItensAtivos =
      bundle?.contratos?.produtosInstituicao.filter((p) => p.ativo && p.precoUnitario > 0).length ?? 0;
    if (localItensAtivos === 0 && cloudItensAtivos > 0) return;
  }

  payload.updatedAt = new Date().toISOString();
  try {
    await fetch("/api/cooperativa-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, section: "contratos", payload }),
    });
  } catch {
    /* offline */
  }
}

export async function pushOperacionalToCloud(
  cnpj: string,
  data?: AppData,
  coopId?: string,
  options?: { authoritative?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  if (needsOperationalResetCloudPush()) {
    await pushOperationalResetToCloud(digits, coopId);
  }

  const d = aplicarPrestacoesContasExcluidas(data ?? getData());
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  let merged = d;
  let bundle: Awaited<ReturnType<typeof fetchSyncBundle>> | null = null;
  let cloudCooperados: Cooperado[] = [];
  if (!options?.authoritative) {
    bundle = await fetchSyncBundle(digits);
    cloudCooperados = (await fetchCooperadosFromCloud(digits)).cooperados;
    if (bundle?.operacional) {
      merged = mergeOperacionalIntoData(d, bundle.operacional, cid, cloudCooperados);
      saveDataSafe(merged);
    }
  } else {
    saveDataSafe(merged);
  }

  const payload = buildOperacionalPayload(merged, cid);
  const cloudMensalidades = prepararMensalidadesCloud(
    merged,
    bundle?.operacional?.mensalidades ?? [],
    cid,
    cloudCooperados
  );
  if (bundle?.operacional) {
    payload.mensalidades = mesclarMensalidadesPayloadNuvem(
      merged,
      cid,
      payload.mensalidades,
      cloudMensalidades
    );
  }
  payload.mensalidades = payload.mensalidades.map((m) =>
    enriquecerMensalidadeCooperadoSnapshot(merged, m, cid)
  );

  const cooperadosCoop = merged.cooperados.filter(
    (c) => c.cooperativaId === cid && c.status !== "desligado"
  );
  await Promise.all(cooperadosCoop.map((c) => pushCooperadoToCloud(digits, c)));

  payload.updatedAt = new Date().toISOString();
  try {
    await fetch("/api/cooperativa-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, section: "operacional", payload }),
    });
  } catch {
    /* offline */
  }
}

export async function pushCooperativaProfileToCloud(cooperativa: Cooperativa): Promise<void> {
  const cnpj = normalizeCnpj(cooperativa.cnpj);
  if (cnpj.length !== 14) return;
  try {
    await fetch(`/api/cooperativas/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: cooperativa.nome,
        endereco: cooperativa.endereco,
        telefone: cooperativa.telefone,
        responsavel: cooperativa.responsavel,
        email: cooperativa.email,
        mensalidadeConfig: cooperativa.mensalidadeConfig,
        senhaCadastroCooperado: cooperativa.senhaCadastroCooperado?.trim() ?? "",
      }),
    });
  } catch {
    /* offline */
  }
}

export async function syncContratosFromCloud(cnpj: string): Promise<boolean> {
  const bundle = await fetchSyncBundle(cnpj);
  if (!bundle?.contratos) return false;
  const current = getData();
  const coopId = resolveCoopId(current, cnpj);
  if (!coopId) return false;
  const merged = mergeContratosIntoData(current, bundle.contratos, coopId);
  saveDataSafe(merged);
  return true;
}

/** Responsável republica todo o catálogo (contratos + preços) na nuvem. */
export async function publicarCatalogoContratos(cnpj: string, data?: AppData, coopId?: string): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return false;
  const itens = d.produtosInstituicao.filter(
    (p) => p.cooperativaId === cid && p.ativo && p.precoUnitario > 0
  ).length;
  if (itens === 0) return false;
  await pushContratosToCloud(digits, d, cid, { authoritative: true });
  return true;
}

export async function syncOperacionalFromCloud(cnpj: string): Promise<boolean> {
  const bundle = await fetchSyncBundle(cnpj);
  if (!bundle?.operacional) return false;
  const current = getData();
  const coopId = resolveCoopId(current, cnpj);
  if (!coopId) return false;
  const cloudCooperados = (await fetchCooperadosFromCloud(cnpj)).cooperados;
  const merged = mergeOperacionalIntoData(current, bundle.operacional, coopId, cloudCooperados);
  saveDataSafe(merged);
  return true;
}

export async function syncCooperativaProfileFromCloud(cnpj: string): Promise<boolean> {
  const cloud = await fetchCooperativaByCnpjFromCloud(cnpj);
  if (!cloud) return false;
  const current = getData();
  const mergedCoops = mergeCooperativaIntoData(current.cooperativas, cloud);
  const coopId = resolveCoopId(current, cnpj);
  const next = sincronizarMensalidadeCooperativa({ ...current, cooperativas: mergedCoops }, coopId);
  saveDataSafe(next);
  return true;
}

/** Intervalo padrão de sincronização automática (ms). */
export const SYNC_INTERVAL_MS = 12_000;

/** Sincroniza tudo da cooperativa: cooperados, notas, contratos, operacional, perfil. */
export async function syncAllCooperativaFromCloud(cnpj: string, preferredCoopId?: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  await syncCooperativaProfileFromCloud(digits);
  const coopId = preferredCoopId ?? resolveCoopId(getData(), digits);
  await syncCooperadosFromCloud(digits, coopId);
  await syncNotasPedidoFromCloud(digits);
  await syncContratosFromCloud(digits);
  await syncOperacionalFromCloud(digits);
}

/**
 * Puxa da nuvem e envia alterações locais (operacional + catálogo quando houver itens).
 * Usado pelo sync global para manter responsável e cooperado sempre atualizados.
 */
export async function syncCooperativaBidirectional(
  cnpj: string,
  coopId?: string,
  options?: { pushCatalog?: boolean; pushMensalidades?: boolean }
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  if (needsOperationalResetCloudPush()) {
    await pushOperationalResetToCloud(digits, coopId);
  }

  await syncAllCooperativaFromCloud(digits, coopId);

  const d = getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  if (options?.pushMensalidades !== false) {
    await pushOperacionalToCloud(digits, d, cid);
  }

  if (options?.pushCatalog) {
    const itensCatalogo = getData().produtosInstituicao.filter(
      (p) => p.cooperativaId === cid && p.ativo && p.precoUnitario > 0
    ).length;
    if (itensCatalogo > 0) {
      await pushContratosToCloud(digits, getData(), cid, { authoritative: true });
    }
  }
}

/** Envia contratos + operacional + perfil após alterações locais. */
export async function pushAllCooperativaToCloud(cnpj: string, data?: AppData, coopId?: string): Promise<void> {
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, cnpj);
  const coop = cid ? d.cooperativas.find((c) => c.id === cid) : undefined;

  await Promise.all([
    pushContratosToCloud(cnpj, d, cid, { authoritative: true }),
    pushOperacionalToCloud(cnpj, d, cid),
    coop ? pushCooperativaProfileToCloud(coop) : Promise.resolve(),
  ]);
}

/** Propaga notas pagas para a nuvem após registrar pagamento. */
export async function pushNotasPagasToCloud(cnpj: string, notaIds: string[], data?: AppData): Promise<void> {
  const d = data ?? getData();
  for (const id of notaIds) {
    const nota = d.notasPedido.find((n) => n.id === id);
    if (nota && nota.status === "pago") {
      await patchNotaPedidoInCloud(cnpj, nota);
    }
  }
}
