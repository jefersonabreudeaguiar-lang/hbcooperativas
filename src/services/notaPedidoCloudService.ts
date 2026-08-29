import type { AppData, NotaPedido, User } from "@/types";
import { normalizeCnpj, findCooperativaByCnpj } from "@/utils/cooperativa";
import { fetchCooperativaByCnpjFromCloud } from "@/services/cooperativaCloudService";
import { notaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getNotaCooperativaCnpj, getFotosExibicaoNota, mergeNotaComFotos, contarFotosEnviadasNota, FOTOS_UPLOAD_LOTE } from "@/utils/fotoEntrega";
import { getCooperadoNome } from "@/utils/calculations";
import { getData, saveDataSafe } from "@/services/dataStore";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { needsOperationalResetCloudPush, getCloudResetAppliedVersion } from "@/services/operationalReset";
import { readNotaFotoAtIndex } from "@/services/localMediaStore";
import { slimNotaDraftForUpload } from "@/services/imagePipelineService";
import { flushPendingDeliveryImages } from "@/services/offlineImageQueueService";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  getLastNotasSyncAt,
  markNotasSyncDone,
  shouldForceFullNotasSync,
} from "@/services/syncMetaService";
import {
  isNotaStatusDowngrade,
  isNotaStatusTerminalConferencia,
  protectNotaAgainstStatusDowngrade,
  NOTA_STATUS_RANK,
} from "@/utils/notaStatus";

const STATUS_RANK = NOTA_STATUS_RANK;

/**
 * Evita sumiço na fila do responsável: nota em análise local só sai por
 * rejeição/conferência/pagamento — nunca por rascunho, lista incompleta ou sync.
 */
function shouldApplyCloudNota(local: NotaPedido | undefined, cloud: NotaPedido): boolean {
  if (!local) return true;

  // Sticky fila: aguardando local permanece até decisão do responsável (ou rejeição).
  if (local.status === "aguardando_conferencia") {
    if (cloud.status === "rascunho") return false;
    if (cloud.status === "entregue") {
      // Legacy “em análise” — mescla fotos/meta sem tirar da fila como conferida.
      const cloudTime = new Date(cloud.updatedAt).getTime();
      const localTime = new Date(local.updatedAt).getTime();
      const cloudFotos = contarFotosEnviadasNota(cloud);
      const localFotos = contarFotosEnviadasNota(local);
      return cloudTime > localTime || cloudFotos > localFotos;
    }
    if (cloud.status === "aguardando_conferencia") {
      // Só mescla fotos/meta — status permanece em análise.
      const cloudTime = new Date(cloud.updatedAt).getTime();
      const localTime = new Date(local.updatedAt).getTime();
      const cloudFotos = contarFotosEnviadasNota(cloud);
      const localFotos = contarFotosEnviadasNota(local);
      return cloudTime > localTime || cloudFotos > localFotos;
    }
    if (
      cloud.status === "rejeitada" ||
      cloud.status === "conferida" ||
      cloud.status === "pago" ||
      cloud.status === "cancelado"
    ) {
      // Re-lançamento explícito: nuvem ainda conferida, local voltou à fila com relancadaEm.
      if (
        local.relancadaEm &&
        (cloud.status === "conferida" || cloud.status === "pago") &&
        new Date(local.relancadaEm).getTime() > new Date(cloud.updatedAt).getTime()
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  // Nunca rebaixar conferida/pago para fila/rascunho (mesmo se a nuvem tiver updatedAt mais novo).
  if (
    isNotaStatusTerminalConferencia(local.status) &&
    isNotaStatusDowngrade(local.status, cloud.status)
  ) {
    return false;
  }

  // Responsável rejeitou — cooperado precisa ver o status na hora.
  if (local.status === "rejeitada" && cloud.status === "aguardando_conferencia") {
    return true;
  }

  const localRank = STATUS_RANK[local.status] ?? 0;
  const cloudRank = STATUS_RANK[cloud.status] ?? 0;
  if (cloudRank < localRank) return false;

  // Upgrade de status na nuvem sempre prevalece (ex.: conferida após análise).
  if (cloudRank > localRank) return true;

  const cloudTime = new Date(cloud.updatedAt).getTime();
  const localTime = new Date(local.updatedAt).getTime();
  if (cloudTime > localTime) return true;
  if (cloudTime < localTime) return false;

  return cloudRank >= localRank;
}

function mapRowToNota(row: unknown): NotaPedido | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.payload && typeof r.payload === "object") {
    const payload = r.payload as NotaPedido;
    return payload.id ? payload : null;
  }
  const direct = row as NotaPedido;
  return direct.id ? direct : null;
}

/** Ajusta IDs locais da cooperativa/cooperado ao puxar da nuvem (aparelhos diferentes). */
export function normalizeCloudNotaForLocal(
  data: AppData,
  nota: NotaPedido,
  cnpj: string
): NotaPedido {
  const digits = normalizeCnpj(cnpj);
  const coop = data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === digits);
  if (!coop) {
    return { ...nota, cooperativaCnpj: digits };
  }

  let cooperadoId = nota.cooperadoId;
  let cooperadoNomeSnapshot = nota.cooperadoNomeSnapshot;
  const existeLocal = data.cooperados.some(
    (c) => c.id === cooperadoId && c.cooperativaId === coop.id
  );

  const localPorId = data.cooperados.find(
    (c) => c.id === cooperadoId && c.cooperativaId === coop.id
  );
  if (localPorId) {
    cooperadoNomeSnapshot = cooperadoNomeSnapshot ?? localPorId.nomeCompleto;
  }

  if (!existeLocal && nota.cooperadoNomeSnapshot) {
    const nome = nota.cooperadoNomeSnapshot.trim().toLowerCase();
    const match = data.cooperados.find(
      (c) =>
        c.cooperativaId === coop.id &&
        c.nomeCompleto.trim().toLowerCase() === nome
    );
    if (match) {
      cooperadoId = match.id;
      cooperadoNomeSnapshot = match.nomeCompleto;
    }
  }

  return {
    ...nota,
    cooperativaId: coop.id,
    cooperadoId,
    cooperadoNomeSnapshot,
    cooperativaCnpj: digits,
  };
}

/** Máximo de entregas removidas por ciclo de sync (evita apagar fila inteira por lista incompleta). */
const MAX_NOTA_DELETIONS_PER_SYNC = 2;

/** Limite de conferidas/pagas removidas por sync completo (fichas fantasma no cooperado). */
const MAX_STALE_CONFERIDA_REMOVALS_PER_SYNC = 80;

export interface MergeCloudNotasOptions {
  /** Sync completo da nuvem — remove conferidas/pagas locais que não existem mais na nuvem. */
  pruneStaleConferidas?: boolean;
  /** Aplica status terminal da nuvem mesmo com updatedAt local mais novo (cooperado em análise). */
  forceTerminalStatus?: boolean;
}

function isNotaTerminalRemovivelSeAusenteNaNuvem(status: NotaPedido["status"]): boolean {
  return status === "conferida" || status === "pago" || status === "cancelado";
}

/**
 * Propaga exclusão na nuvem (ex.: cooperado apagou) sem remover a fila inteira
 * quando a listagem da nuvem veio incompleta (reset, timeout, wipe acidental).
 */
function propagateCloudNotaDeletions(
  data: AppData,
  byId: Map<string, NotaPedido>,
  cloudNotas: NotaPedido[],
  cnpj: string
): boolean {
  if (cloudNotas.length === 0) return false;

  const digits = normalizeCnpj(cnpj);
  const cloudIds = new Set(cloudNotas.map((n) => n.id));

  // Só propaga exclusão de rejeitadas. aguardando_conferencia ausente da lista
  // costuma ser rascunho ainda oculto na API (foto parcial / draft tardio) — nunca apagar.
  const localPendingCloud = [...byId.values()].filter(
    (n) =>
      n.status === "rejeitada" &&
      n.fotoNaNuvem &&
      getNotaCooperativaCnpj(data, n) === digits
  );
  const cloudPending = cloudNotas.filter(
    (n) => n.status === "aguardando_conferencia" || n.status === "rejeitada"
  );
  const toRemove = localPendingCloud.filter((n) => !cloudIds.has(n.id));

  if (toRemove.length === 0) return false;

  // Lista da nuvem claramente incompleta — não apagar em massa.
  if (toRemove.length > MAX_NOTA_DELETIONS_PER_SYNC) return false;
  if (toRemove.length + cloudPending.length < localPendingCloud.length - 1) return false;
  if (cloudPending.length === 0 && localPendingCloud.length > 0) return false;

  let changed = false;
  for (const nota of toRemove) {
    byId.delete(nota.id);
    changed = true;
  }
  return changed;
}

/**
 * Sync completo: remove conferidas/pagas locais ausentes da nuvem (notas apagadas na nuvem
 * mas ainda no localStorage do cooperado — causa extrato inflado e fichas fantasma).
 */
function pruneStaleLocalConferidasFromCloud(
  data: AppData,
  byId: Map<string, NotaPedido>,
  cloudNotas: NotaPedido[],
  cnpj: string
): boolean {
  if (cloudNotas.length === 0) return false;

  const digits = normalizeCnpj(cnpj);
  const cloudIds = new Set(cloudNotas.map((n) => n.id));

  const stale = [...byId.values()].filter(
    (n) =>
      getNotaCooperativaCnpj(data, n) === digits &&
      !cloudIds.has(n.id) &&
      isNotaTerminalRemovivelSeAusenteNaNuvem(n.status) &&
      (n.fotoNaNuvem || n.status === "conferida" || n.status === "pago")
  );

  if (stale.length === 0) return false;
  if (stale.length > MAX_STALE_CONFERIDA_REMOVALS_PER_SYNC) return false;

  for (const nota of stale) {
    byId.delete(nota.id);
  }
  return true;
}

function getPendingNotaDeleteIdSet(cnpj: string): Set<string> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return new Set();
  return new Set(
    loadPendingNotaDeletes()
      .filter((e) => e.cnpj === digits)
      .map((e) => e.notaId)
  );
}

/** IDs com exclusão pendente ou tombstone ativo — evita ressuscitar na fila/sync. */
export function getPendingNotaDeleteIds(cnpj: string): ReadonlySet<string> {
  return getPendingNotaDeleteIdSet(cnpj);
}

function isCloudTerminalStatusForCooperado(status: NotaPedido["status"]): boolean {
  return status === "conferida" || status === "pago" || status === "rejeitada" || status === "cancelado";
}

function shouldForceApplyCloudNota(
  local: NotaPedido | undefined,
  cloud: NotaPedido,
  options?: MergeCloudNotasOptions
): boolean {
  if (!options?.forceTerminalStatus || !local) return false;
  if (local.status !== "aguardando_conferencia" && local.status !== "entregue") return false;
  return isCloudTerminalStatusForCooperado(cloud.status);
}

export function mergeCloudNotasIntoData(
  data: AppData,
  cloudNotas: NotaPedido[],
  cnpj: string,
  options?: MergeCloudNotasOptions
): AppData {
  const digits = normalizeCnpj(cnpj);
  const byId = new Map(data.notasPedido.map((n) => [n.id, n]));
  const pendingDeletes = getPendingNotaDeleteIdSet(digits);
  let changed = false;

  for (const raw of cloudNotas) {
    const cn = normalizeCloudNotaForLocal(data, raw, cnpj);
    if (pendingDeletes.has(cn.id)) continue;
    const local = byId.get(cn.id);
    const cloudNota: NotaPedido = {
      ...cn,
      cooperativaCnpj: digits,
      fotoNaNuvem: cn.fotoNaNuvem ?? Boolean(cn.fotoPedido || cn.fotosPedido?.length),
    };
    if (!local || shouldForceApplyCloudNota(local, cloudNota, options) || shouldApplyCloudNota(local, cloudNota)) {
      let mergedNota = local ? mergeNotaComFotos(local, cloudNota) : cloudNota;
      if (local && cloudNota.status !== local.status) {
        // Nunca aplicar rebaixamento de status no merge (fila some e volta).
        if (isNotaStatusDowngrade(local.status, cloudNota.status)) {
          mergedNota = {
            ...mergedNota,
            status: local.status,
            updatedAt: local.updatedAt,
          };
        } else if (
          local.status === "aguardando_conferencia" &&
          cloudNota.status === "entregue"
        ) {
          // Legacy “entregue” na nuvem — mescla fotos, fila permanece em análise.
          mergedNota = {
            ...mergedNota,
            status: "aguardando_conferencia",
            updatedAt: local.updatedAt,
          };
        } else if (
          local.relancadaEm &&
          (cloudNota.status === "conferida" || cloudNota.status === "pago") &&
          new Date(local.relancadaEm).getTime() > new Date(cloudNota.updatedAt).getTime()
        ) {
          // Re-lançamento local mais recente que conferência obsoleta na nuvem.
          mergedNota = {
            ...mergedNota,
            status: "aguardando_conferencia",
            itens: local.itens ?? [],
            valorBruto: local.valorBruto,
            valorDesconto: local.valorDesconto,
            valorLiquido: local.valorLiquido,
            percentualDescontoCooperativa: local.percentualDescontoCooperativa,
            conferidaPor: undefined,
            dataConferencia: undefined,
            divisaoEntrega: undefined,
            rejeitadaPor: undefined,
            dataRejeicao: undefined,
            motivoRejeicao: undefined,
            relancadaEm: local.relancadaEm,
            updatedAt: local.updatedAt,
          };
        } else {
          const conferiuNaNuvem = cloudNota.status === "conferida" || cloudNota.status === "pago";
          const protegida = protectNotaAgainstStatusDowngrade(local, {
            ...cloudNota,
            ...mergedNota,
            status: cloudNota.status,
          });
          mergedNota = {
            ...protegida,
            status: cloudNota.status,
            conferidaPor: cloudNota.conferidaPor,
            dataConferencia: cloudNota.dataConferencia,
            rejeitadaPor: cloudNota.rejeitadaPor,
            dataRejeicao: cloudNota.dataRejeicao,
            motivoRejeicao: cloudNota.motivoRejeicao,
            reenviadaEm: cloudNota.reenviadaEm,
            relancadaEm: undefined,
            ...(conferiuNaNuvem
              ? {
                  itens: cloudNota.itens ?? mergedNota.itens,
                  valorBruto: cloudNota.valorBruto,
                  valorDesconto: cloudNota.valorDesconto,
                  valorLiquido: cloudNota.valorLiquido,
                  percentualDescontoCooperativa: cloudNota.percentualDescontoCooperativa,
                }
              : {}),
            updatedAt: cloudNota.updatedAt,
          };
        }
      } else if (local?.status === "aguardando_conferencia" || local?.status === "entregue") {
        // Merge de fotos não pode tirar da fila.
        mergedNota = {
          ...mergedNota,
          status: local.status === "entregue" ? "entregue" : "aguardando_conferencia",
        };
      }
      byId.set(mergedNota.id, mergedNota);
      changed = true;
    }
  }

  if (propagateCloudNotaDeletions(data, byId, cloudNotas, cnpj)) {
    changed = true;
  }

  if (options?.pruneStaleConferidas && pruneStaleLocalConferidasFromCloud(data, byId, cloudNotas, cnpj)) {
    changed = true;
  }

  if (!changed) return data;
  return { ...data, notasPedido: Array.from(byId.values()) };
}

export async function fetchNotasPedidoFromCloud(
  cnpj: string,
  options?: { since?: string; forceFull?: boolean }
): Promise<{
  ok: boolean;
  notas: NotaPedido[];
  delta: boolean;
  serverWatermark?: string;
  storageOnly?: boolean;
}> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, notas: [], delta: false };

  const forceFull = options?.forceFull ?? shouldForceFullNotasSync(digits);
  const since = forceFull ? undefined : options?.since ?? getLastNotasSyncAt(digits);

  try {
    const qs = new URLSearchParams({ cnpj: digits, lite: "1" });
    if (since) qs.set("since", since);
    const res = await secureApiFetch(`/api/notas-pedido?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, notas: [], delta: Boolean(since) };
    const json = await res.json().catch(() => ({}));
    const notas = ((json.notas ?? []) as unknown[])
      .map(mapRowToNota)
      .filter((n): n is NotaPedido => Boolean(n));
    const serverWatermark =
      typeof json.serverWatermark === "string" ? json.serverWatermark : undefined;
    const storageOnly = json.storageOnly === true;
    // Storage-only: lista completa sempre — não tratar como delta incompleto.
    return {
      ok: true,
      notas,
      delta: storageOnly ? false : Boolean(since),
      serverWatermark: storageOnly ? undefined : serverWatermark,
      storageOnly,
    };
  } catch {
    return { ok: false, notas: [], delta: Boolean(since) };
  }
}

export async function fetchNotaPedidoFromCloud(
  cnpj: string,
  notaId: string,
  options?: { metaOnly?: boolean }
): Promise<NotaPedido | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;

  const metaOnly = options?.metaOnly !== false;

  try {
    const res = await secureApiFetch(
      `/api/notas-pedido/${encodeURIComponent(notaId)}?cnpj=${digits}${metaOnly ? "" : "&full=1"}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const nota = json.nota as NotaPedido | undefined;
    return nota?.id ? nota : null;
  } catch {
    return null;
  }
}

/** Carrega todas as fotos de uma nota para exibição (local, IDB ou nuvem). */
export async function resolveFotosNotaParaExibicao(
  nota: NotaPedido,
  cnpj?: string
): Promise<string[]> {
  const qtd = contarFotosEnviadasNota(nota);
  if (qtd <= 0) return [];

  const digits = cnpj ? normalizeCnpj(cnpj) : normalizeCnpj(nota.cooperativaCnpj ?? "");
  const cnpjOk = digits.length === 14 ? digits : undefined;
  const inline = getFotosExibicaoNota(nota);
  const out: string[] = [];

  for (let i = 0; i < qtd; i++) {
    if (inline[i]) {
      out.push(inline[i]);
      continue;
    }
    const local = await readNotaFotoAtIndex(nota, i);
    if (local) {
      out.push(local);
      continue;
    }
    if (cnpjOk) {
      const cloud = await fetchNotaFotoPartBlobUrl(cnpjOk, nota.id, i);
      if (cloud) {
        out.push(cloud);
        continue;
      }
    }
  }

  return out;
}

/** Carrega uma foto da nuvem como blob: URL (libera com revokePreviewUrl). */
export async function fetchNotaFotoPartBlobUrl(
  cnpj: string,
  notaId: string,
  index: number
): Promise<string | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;

  try {
    const res = await secureApiFetch(
      `/api/notas-pedido/${encodeURIComponent(notaId)}/foto?cnpj=${digits}&index=${index}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function getCooperativaCnpj(data: AppData, cooperativaId?: string): string | undefined {
  if (!cooperativaId) return undefined;
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cnpj = normalizeCnpj(coop?.cnpj ?? "");
  return cnpj.length === 14 ? cnpj : undefined;
}

/** Resolve CNPJ local, do usuário ou da nuvem — essencial para cooperado e responsável em aparelhos diferentes. */
export async function resolveCooperativaCnpj(
  data: AppData,
  cooperativaId?: string,
  user?: Pick<User, "cooperativaCnpj" | "cooperativaId"> | null
): Promise<string | undefined> {
  const fromCoop = getCooperativaCnpj(data, cooperativaId ?? user?.cooperativaId);
  if (fromCoop) return fromCoop;

  const fromUser = normalizeCnpj(user?.cooperativaCnpj ?? "");
  if (fromUser.length === 14) return fromUser;

  const coop = data.cooperativas.find((c) => c.id === (cooperativaId ?? user?.cooperativaId));
  const guess = normalizeCnpj(coop?.cnpj ?? "");
  if (guess.length === 14) return guess;

  if (fromUser.length === 14) {
    const cloud = await fetchCooperativaByCnpjFromCloud(fromUser);
    if (cloud) return normalizeCnpj(cloud.cnpj);
  }

  return undefined;
}

export async function pushNotasPedidoToCloud(
  cnpj: string,
  notas: NotaPedido[],
  cooperadoNome?: string
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || notas.length === 0) return { ok: true };

  try {
    for (const nota of notas) {
      const res = await secureApiFetch("/api/notas-pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: digits, notas: [nota], cooperadoNome }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503) {
        return {
          ok: false,
          offline: true,
          error: (json.error as string) ?? "Nuvem indisponível.",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          error: (json.error as string) ?? "Erro ao enviar entrega na nuvem.",
        };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, offline: true, error: "Sem conexão com o servidor." };
  }
}

const PENDING_NOTA_DELETES_KEY = "coopeagriplla_pending_nota_deletes";

function pendingNotaDeletesStorage(): Storage | null {
  if (typeof window !== "undefined") return window.localStorage;
  const g = globalThis as { localStorage?: Storage };
  return g.localStorage ?? null;
}

function loadPendingNotaDeletes(): { cnpj: string; notaId: string }[] {
  const storage = pendingNotaDeletesStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(PENDING_NOTA_DELETES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { cnpj?: string; notaId?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e.cnpj && e.notaId)
      .map((e) => ({ cnpj: normalizeCnpj(String(e.cnpj)), notaId: String(e.notaId) }));
  } catch {
    return [];
  }
}

function savePendingNotaDeletes(entries: { cnpj: string; notaId: string }[]): void {
  const storage = pendingNotaDeletesStorage();
  if (!storage) return;
  if (entries.length === 0) storage.removeItem(PENDING_NOTA_DELETES_KEY);
  else storage.setItem(PENDING_NOTA_DELETES_KEY, JSON.stringify(entries));
}

export function queueNotaDelete(cnpj: string, notaId: string): void {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !notaId) return;
  const entries = loadPendingNotaDeletes();
  if (entries.some((e) => e.cnpj === digits && e.notaId === notaId)) return;
  savePendingNotaDeletes([...entries, { cnpj: digits, notaId }]);
}

/** Remove da fila de exclusão pendente após DELETE confirmado na nuvem. */
export function unqueueNotaDelete(cnpj: string, notaId: string): void {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !notaId) return;
  const entries = loadPendingNotaDeletes().filter(
    (e) => !(e.cnpj === digits && e.notaId === notaId)
  );
  savePendingNotaDeletes(entries);
}

export async function flushPendingNotaDeletes(cnpj?: string): Promise<void> {
  const digits = cnpj ? normalizeCnpj(cnpj) : "";
  let entries = loadPendingNotaDeletes();
  if (digits.length === 14) {
    entries = entries.filter((e) => e.cnpj === digits);
  }
  if (entries.length === 0) return;

  const remaining: { cnpj: string; notaId: string }[] = [];
  const all = loadPendingNotaDeletes();

  for (const entry of entries) {
    const result = await deleteNotaPedidoFromCloud(entry.cnpj, entry.notaId);
    if (!result.ok) {
      remaining.push(entry);
    }
  }

  const other = digits.length === 14
    ? all.filter((e) => e.cnpj !== digits)
    : [];
  savePendingNotaDeletes([...other, ...remaining]);
}

export async function deleteNotaPedidoFromCloud(
  cnpj: string,
  notaId: string
): Promise<{ ok: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  try {
    const res = await secureApiFetch(
      `/api/notas-pedido/${encodeURIComponent(notaId)}?cnpj=${digits}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (json.error as string) ?? "Erro ao excluir na nuvem." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

export async function patchNotaPedidoInCloud(
  cnpj: string,
  nota: NotaPedido
): Promise<{ ok: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  try {
    const res = await secureApiFetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, nota }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (json.error as string) ?? "Erro ao atualizar entrega na nuvem." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

export async function syncOfflineDeliveryImages(): Promise<{
  uploaded: number;
  failed: number;
  remaining: number;
}> {
  return flushPendingDeliveryImages();
}

/** Envia uma foto para a nuvem assim que tirada (entrega fica em rascunho até Enviar). */
export async function uploadFotoImediataToCloud(
  cnpj: string,
  nota: NotaPedido,
  index: number,
  totalCount: number,
  fotoDataUrl: string,
  cooperadoNome?: string
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  const jaPublicada = nota.status !== "rascunho";
  const metaNota: NotaPedido = slimNotaDraftForUpload({
    ...nota,
    status: jaPublicada ? nota.status : "rascunho",
    fotosEnviadasCount: totalCount,
    fotoNaNuvem: true,
  });

  try {
    const res = await secureApiFetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}/foto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cnpj: digits,
        index,
        totalCount,
        foto: fotoDataUrl,
        draft: !jaPublicada,
        nota: metaNota,
        cooperadoNome: index === 0 ? cooperadoNome : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) {
      return { ok: false, offline: true, error: (json.error as string) ?? "Nuvem indisponível." };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: (json.error as string) ?? `Erro ao enviar foto ${index + 1} para a nuvem.`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, offline: true, error: "Sem conexão com o servidor." };
  }
}

/** Envia foto comprimida como Blob (FormData) — memória constante no celular. */
export async function uploadFotoBlobToCloud(
  cnpj: string,
  nota: NotaPedido,
  index: number,
  totalCount: number,
  fotoBlob: Blob,
  cooperadoNome?: string,
  ext: "jpg" | "webp" = "jpg"
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  // Nunca rebaixar entrega já publicada (Enviar) de volta para rascunho —
  // draft tardio / fila offline apagava a nota da listagem da API.
  const jaPublicada = nota.status !== "rascunho";
  const metaNota: NotaPedido = slimNotaDraftForUpload({
    ...nota,
    status: jaPublicada ? nota.status : "rascunho",
    fotosEnviadasCount: totalCount,
    fotoNaNuvem: true,
  });

  try {
    const form = new FormData();
    form.append("cnpj", digits);
    form.append("index", String(index));
    form.append("totalCount", String(totalCount));
    form.append("draft", jaPublicada ? "false" : "true");
    form.append("foto", fotoBlob, `foto-${String(index).padStart(3, "0")}.${ext}`);
    form.append("mimeType", fotoBlob.type || (ext === "webp" ? "image/webp" : "image/jpeg"));
    form.append("nota", JSON.stringify(metaNota));
    if (index === 0 && cooperadoNome) form.append("cooperadoNome", cooperadoNome);

    const res = await secureApiFetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}/foto`, {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) {
      return { ok: false, offline: true, error: (json.error as string) ?? "Nuvem indisponível." };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: (json.error as string) ?? `Erro ao enviar foto ${index + 1} para a nuvem.`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, offline: true, error: "Sem conexão com o servidor." };
  }
}

/** Remove foto da nuvem (rascunho) e compacta índices. */
export async function deleteFotoRascunhoFromCloud(
  cnpj: string,
  notaId: string,
  index: number,
  totalCount: number
): Promise<{ ok: boolean; newCount?: number; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  try {
    const res = await secureApiFetch(
      `/api/notas-pedido/${encodeURIComponent(notaId)}/foto?cnpj=${digits}&index=${index}&totalCount=${totalCount}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (json.error as string) ?? "Erro ao remover foto na nuvem." };
    }
    return { ok: true, newCount: Number(json.newCount) };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

/** Publica entrega para o responsável (sai de rascunho). */
export async function finalizeNotaEntregaNaNuvem(
  cnpj: string,
  nota: NotaPedido,
  cooperadoNome?: string
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  // Nunca rebaixar se a nuvem já avançou (conferida/pago/rejeitada).
  const existing = await fetchNotaPedidoFromCloud(digits, nota.id, { metaOnly: true });
  if (existing?.status) {
    if (isNotaStatusTerminalConferencia(existing.status) || existing.status === "rejeitada") {
      return { ok: true };
    }
    if (existing.status === "aguardando_conferencia") {
      return { ok: true };
    }
  }

  const finalNota: NotaPedido = {
    ...nota,
    status: "aguardando_conferencia",
    fotoNaNuvem: true,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
    cooperadoNomeSnapshot: nota.cooperadoNomeSnapshot ?? cooperadoNome,
    updatedAt: new Date().toISOString(),
  };

  const patched = await patchNotaPedidoInCloud(digits, finalNota);
  if (!patched.ok) return patched;

  // Confirma que a nuvem realmente saiu de rascunho (PATCH antigo podia
  // "suceder" com 0 linhas e a entrega sumia da lista do responsável).
  const cloud = await fetchNotaPedidoFromCloud(digits, finalNota.id, { metaOnly: true });
  if (cloud && cloud.status === "rascunho") {
    const retry = await pushNotasPedidoToCloud(digits, [finalNota], cooperadoNome);
    if (!retry.ok) {
      return {
        ok: false,
        error: retry.error ?? "Entrega não publicou na nuvem. Tente Enviar de novo.",
      };
    }
  }

  return { ok: true };
}

/** Republica na nuvem todas as entregas locais ainda em análise (cooperado). */
export async function republishLocalAguardandoConferencia(
  cnpj: string,
  cooperadoId: string,
  cooperativaId?: string
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return 0;

  const data = getData();
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const pendentes = data.notasPedido.filter(
    (n) =>
      n.status === "aguardando_conferencia" &&
      n.fotoNaNuvem &&
      notaPertenceCooperado(data, n, canonico, cooperativaId)
  );
  if (pendentes.length === 0) return 0;

  let okCount = 0;
  let adopted = data;
  let adoptedChanged = false;

  for (const nota of pendentes) {
    const cloud = await fetchNotaPedidoFromCloud(digits, nota.id, { metaOnly: true });
    // Já publicada e visível — não precisa republicar.
    if (cloud && cloud.status && cloud.status !== "rascunho") {
      // Nuvem já conferiu/rejeitou — adota localmente (some do mural "em análise").
      if (cloud.status !== "aguardando_conferencia") {
        adopted = mergeCloudNotasIntoData(adopted, [cloud], digits);
        adoptedChanged = true;
      }
      okCount += 1;
      continue;
    }
    const nome =
      nota.cooperadoNomeSnapshot ??
      getCooperadoNome(data.cooperados, nota.cooperadoId);
    const result = await finalizeNotaEntregaNaNuvem(digits, nota, nome);
    if (result.ok) okCount += 1;
  }

  if (adoptedChanged) {
    const reconciled = reconciliarFichaFromNotasConferidas(adopted);
    saveDataSafe(reconciled);
  }

  return okCount;
}

/** Envia fotos uma a uma — memória constante no celular. */
export async function pushNotaComFotosEmStreaming(
  cnpj: string,
  nota: NotaPedido,
  readFotoAt: (index: number) => Promise<string | undefined>,
  totalCount: number,
  cooperadoNome?: string,
  onProgress?: (sent: number, total: number) => void
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };
  if (totalCount <= 0) return pushNotasPedidoToCloud(cnpj, [nota], cooperadoNome);

  const metaNota: NotaPedido = slimNotaDraftForUpload({
    ...nota,
    status: nota.status === "rascunho" ? "rascunho" : nota.status,
    fotosEnviadasCount: totalCount,
    fotoNaNuvem: true,
  });
  const isDraft = metaNota.status === "rascunho";

  try {
    let startIndex = 0;
    try {
      const progressRes = await secureApiFetch(
        `/api/notas-pedido/${encodeURIComponent(nota.id)}?cnpj=${digits}&uploadProgress=1`
      );
      if (progressRes.ok) {
        const progressJson = await progressRes.json().catch(() => ({}));
        const uploaded = Number(progressJson.uploadedParts ?? 0);
        if (uploaded >= totalCount) {
          if (!isDraft) {
            await finalizeNotaEntregaNaNuvem(digits, nota, cooperadoNome);
          }
          return { ok: true };
        }
        if (uploaded > 0) startIndex = uploaded;
      }
    } catch {
      /* primeira tentativa */
    }

    for (let i = startIndex; i < totalCount; i++) {
      const foto = await readFotoAt(i);
      if (!foto) {
        return { ok: false, error: `Foto ${i + 1} de ${totalCount} não encontrada no aparelho.` };
      }

      const res = await secureApiFetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}/foto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: digits,
          index: i,
          totalCount,
          foto,
          draft: isDraft,
          nota: metaNota,
          cooperadoNome: i === 0 ? cooperadoNome : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: (json.error as string) ?? `Erro ao enviar foto ${i + 1} de ${totalCount}.`,
        };
      }
      onProgress?.(i + 1, totalCount);
    }
    if (!isDraft) {
      await finalizeNotaEntregaNaNuvem(digits, nota, cooperadoNome);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

/** Envia muitas fotos em lotes — fallback quando fotos já estão na RAM. */
export async function pushNotaComFotosEmLotes(
  cnpj: string,
  nota: NotaPedido,
  fotos: string[],
  cooperadoNome?: string,
  loteSize = FOTOS_UPLOAD_LOTE
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  if (fotos.length === 0) {
    return pushNotasPedidoToCloud(cnpj, [nota], cooperadoNome);
  }

  if (fotos.length > 2) {
    return pushNotaComFotosEmStreaming(
      cnpj,
      nota,
      (i) => Promise.resolve(fotos[i]),
      fotos.length,
      cooperadoNome
    );
  }

  if (fotos.length <= loteSize) {
    return pushNotasPedidoToCloud(
      cnpj,
      [
        {
          ...nota,
          fotoPedido: fotos[0],
          fotosPedido: fotos,
          fotosEnviadasCount: fotos.length,
          fotoNaNuvem: true,
        },
      ],
      cooperadoNome
    );
  }

  const firstBatch = fotos.slice(0, loteSize);
  const initial: NotaPedido = {
    ...nota,
    fotoPedido: firstBatch[0],
    fotosPedido: firstBatch,
    fotosEnviadasCount: fotos.length,
    fotoNaNuvem: true,
    updatedAt: new Date().toISOString(),
  };

  const created = await pushNotasPedidoToCloud(cnpj, [initial], cooperadoNome);
  if (!created.ok) return created;

  let accumulated = [...firstBatch];
  for (let i = loteSize; i < fotos.length; i += loteSize) {
    accumulated = [...accumulated, ...fotos.slice(i, i + loteSize)];
    const updated: NotaPedido = {
      ...nota,
      fotoPedido: accumulated[0],
      fotosPedido: accumulated,
      fotosEnviadasCount: fotos.length,
      fotoNaNuvem: true,
      updatedAt: new Date().toISOString(),
    };
    const patched = await patchNotaPedidoInCloud(cnpj, updated);
    if (!patched.ok) {
      return {
        ok: false,
        error:
          patched.error ??
          `Falha ao enviar lote ${Math.ceil(i / loteSize) + 1}. Verifique a conexão e tente de novo.`,
      };
    }
  }

  return { ok: true };
}

export async function syncNotasPedidoFromCloud(cnpj: string): Promise<number> {
  if (needsOperationalResetCloudPush()) return 0;
  await flushPendingNotaDeletes(cnpj);
  const digits = normalizeCnpj(cnpj);
  const forceFull = shouldForceFullNotasSync(digits);
  const { ok, notas: cloudNotas, delta, serverWatermark, storageOnly } =
    await fetchNotasPedidoFromCloud(digits, { forceFull });
  if (!ok) return 0;

  const current = getData();
  const coop = findCooperativaByCnpj(current, digits);
  const cloudResetApplied = getCloudResetAppliedVersion(digits) > 0;
  const treatAsFull = forceFull || storageOnly || !delta;

  if (cloudNotas.length === 0 && treatAsFull) {
    // Lista vazia no full: só limpa se houve reset de nuvem explícito.
    // NUNCA apaga notas em análise — sync incompleto/storage falhou não pode esconder fila.
    if (coop && cloudResetApplied) {
      const filtered = current.notasPedido.filter((n) => {
        if (n.cooperativaId !== coop.id && getNotaCooperativaCnpj(current, n) !== digits) {
          return true;
        }
        // Preserva entregas lançadas pelo cooperado ainda não conferidas.
        if (n.status === "aguardando_conferencia" || n.status === "entregue") {
          return true;
        }
        return false;
      });
      if (filtered.length !== current.notasPedido.length) {
        saveDataSafe(reconciliarFichaFromNotasConferidas({ ...current, notasPedido: filtered }));
      }
    }
    markNotasSyncDone(digits, true, [], serverWatermark);
    return 0;
  }

  if (delta && cloudNotas.length === 0) {
    markNotasSyncDone(digits, false, [], serverWatermark);
    return 0;
  }

  const pendingDeletes = getPendingNotaDeleteIdSet(digits);

  const beforeAguardando = current.notasPedido.filter(
    (n) =>
      (n.status === "aguardando_conferencia" || n.status === "entregue") &&
      !pendingDeletes.has(n.id)
  );

  let merged = mergeCloudNotasIntoData(current, cloudNotas, digits, {
    pruneStaleConferidas: treatAsFull,
  });

  // Invariante: sync nunca remove/rebaixa para rascunho uma entrega em análise.
  const afterById = new Map(merged.notasPedido.map((n) => [n.id, n]));
  let notas = [...merged.notasPedido];
  let invariantFixed = false;
  for (const before of beforeAguardando) {
    if (pendingDeletes.has(before.id)) continue;
    const after = afterById.get(before.id);
    if (!after) {
      // Não ressuscita entregas removidas localmente (ex.: exclusão pelo responsável).
      continue;
    }
    if (after.status === "rascunho") {
      notas = notas.map((n) =>
        n.id === before.id
          ? { ...n, status: before.status, updatedAt: before.updatedAt }
          : n
      );
      invariantFixed = true;
    }
  }
  if (invariantFixed) {
    merged = { ...merged, notasPedido: notas };
  }

  const reconciled = reconciliarFichaFromNotasConferidas(merged);
  if (reconciled !== current) {
    saveDataSafe(reconciled);
  }
  markNotasSyncDone(digits, treatAsFull, cloudNotas, serverWatermark);
  return cloudNotas.filter((n) => n.status === "aguardando_conferencia").length;
}

/**
 * Atualiza entregas que ainda aparecem "em análise" no aparelho mas já foram
 * conferidas/rejeitadas na nuvem (fallback quando o delta sync perdeu a nota).
 */
export async function refreshCooperadoNotasEmAnalise(
  cnpj: string,
  cooperadoId: string,
  cooperativaId?: string
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return 0;

  const data = getData();
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const emAnalise = data.notasPedido.filter(
    (n) =>
      n.status === "aguardando_conferencia" &&
      n.fotoNaNuvem &&
      notaPertenceCooperado(data, n, canonico, cooperativaId)
  );

  if (emAnalise.length === 0) return 0;

  let merged = data;
  const atualizadas: NotaPedido[] = [];

  for (const nota of emAnalise) {
    const cloud = await fetchNotaPedidoFromCloud(digits, nota.id);
    if (!cloud || cloud.status === nota.status || cloud.status === "rascunho") continue;
    merged = mergeCloudNotasIntoData(merged, [cloud], digits, {
      forceTerminalStatus: isCloudTerminalStatusForCooperado(cloud.status),
    });
    atualizadas.push(cloud);
  }

  if (atualizadas.length === 0) return 0;

  const reconciled = reconciliarFichaFromNotasConferidas(merged);
  if (reconciled !== data) {
    saveDataSafe(reconciled);
  }
  markNotasSyncDone(digits, false, atualizadas);
  return atualizadas.length;
}

export async function ensureNotaComFoto(
  data: AppData,
  nota: NotaPedido,
  coopId?: string
): Promise<NotaPedido> {
  const localFotos = getFotosExibicaoNota(nota);
  const esperado = Math.max(
    nota.fotosEnviadasCount ?? 0,
    contarFotosEnviadasNota(nota),
    localFotos.length
  );
  const fullResCount = nota.fotosPedido?.length ?? 0;

  if (esperado <= 0) return nota;
  if (fullResCount >= esperado) return nota;
  if (localFotos.length >= esperado) return nota;

  const cnpj = getCooperativaCnpj(data, coopId ?? nota.cooperativaId);
  if (!cnpj) return nota;

  if (!nota.fotoNaNuvem && fullResCount === 0 && localFotos.length === 0) return nota;

  const cloud = await fetchNotaPedidoFromCloud(cnpj, nota.id, { metaOnly: true });
  if (!cloud) return nota;

  return mergeNotaComFotos(nota, cloud);
}
