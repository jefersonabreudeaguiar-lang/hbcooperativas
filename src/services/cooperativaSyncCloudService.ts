import type { AppData, Cooperativa } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { ContratosSyncPayload, OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { getData, saveDataSafe } from "@/services/dataStore";
import { syncCooperadosFromCloud } from "@/services/cooperadoCloudService";
import { syncNotasPedidoFromCloud, patchNotaPedidoInCloud } from "@/services/notaPedidoCloudService";
import { fetchCooperativaByCnpjFromCloud, mergeCooperativaIntoData } from "@/services/cooperativaCloudService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";

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

function resolveCoopId(data: AppData, cnpj: string): string | undefined {
  const digits = normalizeCnpj(cnpj);
  return data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === digits)?.id;
}

function buildContratosPayload(data: AppData, coopId: string): ContratosSyncPayload {
  const now = new Date().toISOString();
  return {
    updatedAt: now,
    instituicoes: data.instituicoes.filter((i) => i.cooperativaId === coopId),
    produtosInstituicao: data.produtosInstituicao.filter((p) => p.cooperativaId === coopId),
  };
}

function buildOperacionalPayload(data: AppData, coopId: string): OperacionalSyncPayload {
  const now = new Date().toISOString();
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));
  return {
    updatedAt: now,
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
    pagamentosCooperado: data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId),
    comunicados: data.comunicados.filter((c) => c.cooperativaId === coopId),
    mensalidades: data.mensalidades.filter((m) => cooperadoIds.has(m.cooperadoId)),
    config: { ...data.config },
  };
}

export function mergeContratosIntoData(data: AppData, cloud: ContratosSyncPayload, coopId: string): AppData {
  const localInst = data.instituicoes.filter((i) => i.cooperativaId !== coopId);
  const localProd = data.produtosInstituicao.filter((p) => p.cooperativaId !== coopId);

  // Remapeia para o coopId local — aparelhos diferentes usam IDs distintos para a mesma cooperativa.
  const cloudInst = cloud.instituicoes.map((i) => ({ ...i, cooperativaId: coopId }));
  const cloudProd = cloud.produtosInstituicao.map((p) => ({ ...p, cooperativaId: coopId }));

  return {
    ...data,
    instituicoes: [...localInst, ...mergeArrayByNewer(data.instituicoes.filter((i) => i.cooperativaId === coopId), cloudInst)],
    produtosInstituicao: [
      ...localProd,
      ...mergeArrayByNewer(data.produtosInstituicao.filter((p) => p.cooperativaId === coopId), cloudProd),
    ],
  };
}

export function mergeOperacionalIntoData(data: AppData, cloud: OperacionalSyncPayload, coopId: string): AppData {
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));

  const cloudArquivos = cloud.arquivosMensais.map((a) => ({ ...a, cooperativaId: coopId }));
  const cloudPagamentos = cloud.pagamentosCooperado.map((p) => ({ ...p, cooperativaId: coopId }));
  const cloudComunicados = cloud.comunicados.map((c) => ({ ...c, cooperativaId: coopId }));

  const filterCoop = <T extends { cooperativaId?: string; cooperadoId?: string }>(
    items: T[],
    isCoop: (i: T) => boolean
  ) => items.filter((i) => !isCoop(i));

  let next: AppData = {
    ...data,
    arquivosMensais: [
      ...filterCoop(data.arquivosMensais, (a) => a.cooperativaId === coopId),
      ...mergeArrayByNewer(
        data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
        cloudArquivos
      ),
    ],
    pagamentosCooperado: [
      ...filterCoop(data.pagamentosCooperado, (p) => p.cooperativaId === coopId),
      ...mergeArrayByNewer(
        data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId),
        cloudPagamentos
      ),
    ],
    comunicados: [
      ...filterCoop(data.comunicados, (c) => c.cooperativaId === coopId),
      ...mergeArrayByNewer(
        data.comunicados.filter((c) => c.cooperativaId === coopId),
        cloudComunicados
      ),
    ],
    mensalidades: [
      ...data.mensalidades.filter((m) => !cooperadoIds.has(m.cooperadoId)),
      ...mergeArrayByNewer(
        data.mensalidades.filter((m) => cooperadoIds.has(m.cooperadoId)),
        cloud.mensalidades.filter((m) => cooperadoIds.has(m.cooperadoId))
      ),
    ],
  };

  const localConfigTime = new Date(data.cooperativas.find((c) => c.id === coopId)?.updatedAt ?? 0).getTime();
  const cloudConfigTime = new Date(cloud.updatedAt).getTime();
  if (cloudConfigTime >= localConfigTime && cloud.config) {
    next = { ...next, config: { ...next.config, ...cloud.config } };
  }

  return reconciliarFichaFromNotasConferidas(next);
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

export async function pushContratosToCloud(cnpj: string, data?: AppData, coopId?: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  const payload = buildContratosPayload(d, cid);
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

export async function pushOperacionalToCloud(cnpj: string, data?: AppData, coopId?: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, digits);
  if (!cid) return;

  const payload = buildOperacionalPayload(d, cid);
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
  if (merged === current) return false;
  saveDataSafe(merged);
  return true;
}

export async function syncOperacionalFromCloud(cnpj: string): Promise<boolean> {
  const bundle = await fetchSyncBundle(cnpj);
  if (!bundle?.operacional) return false;
  const current = getData();
  const coopId = resolveCoopId(current, cnpj);
  if (!coopId) return false;
  const merged = mergeOperacionalIntoData(current, bundle.operacional, coopId);
  if (merged === current) return false;
  saveDataSafe(merged);
  return true;
}

export async function syncCooperativaProfileFromCloud(cnpj: string): Promise<boolean> {
  const cloud = await fetchCooperativaByCnpjFromCloud(cnpj);
  if (!cloud) return false;
  const current = getData();
  const mergedCoops = mergeCooperativaIntoData(current.cooperativas, cloud);
  if (mergedCoops === current.cooperativas) return false;
  saveDataSafe({ ...current, cooperativas: mergedCoops });
  return true;
}

/** Sincroniza tudo da cooperativa: cooperados, notas, contratos, operacional, perfil. */
export async function syncAllCooperativaFromCloud(cnpj: string): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  await syncCooperativaProfileFromCloud(digits);
  await syncCooperadosFromCloud(digits);
  await syncNotasPedidoFromCloud(digits);
  await syncContratosFromCloud(digits);
  await syncOperacionalFromCloud(digits);
}

/** Envia contratos + operacional + perfil após alterações locais. */
export async function pushAllCooperativaToCloud(cnpj: string, data?: AppData, coopId?: string): Promise<void> {
  const d = data ?? getData();
  const cid = coopId ?? resolveCoopId(d, cnpj);
  const coop = cid ? d.cooperativas.find((c) => c.id === cid) : undefined;

  await Promise.all([
    pushContratosToCloud(cnpj, d, cid),
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
