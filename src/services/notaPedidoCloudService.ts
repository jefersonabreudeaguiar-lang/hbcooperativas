import type { AppData, NotaPedido, User } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { fetchCooperativaByCnpjFromCloud } from "@/services/cooperativaCloudService";
import { getNotaCooperativaCnpj, getFotosExibicaoNota, mergeNotaComFotos, contarFotosEnviadasNota, FOTOS_UPLOAD_LOTE } from "@/utils/fotoEntrega";
import { getData, saveDataSafe } from "@/services/dataStore";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { needsOperationalResetCloudPush } from "@/services/operationalReset";
const STATUS_RANK: Record<NotaPedido["status"], number> = {
  rascunho: 0,
  aguardando_conferencia: 0,
  rejeitada: 1,
  entregue: 2,
  conferida: 2,
  pago: 3,
  cancelado: 3,
};

/** Evita que sync da nuvem recoloque na fila uma entrega já baixada localmente. */
function shouldApplyCloudNota(local: NotaPedido | undefined, cloud: NotaPedido): boolean {
  if (!local) return true;

  // Responsável rejeitou — cooperado precisa ver o status na hora.
  if (local.status === "aguardando_conferencia" && cloud.status === "rejeitada") {
    return true;
  }

  // Cooperado reenviou após rejeição — responsável volta a ver na fila.
  if (local.status === "rejeitada" && cloud.status === "aguardando_conferencia") {
    return true;
  }

  // Rascunho na nuvem (foto parcial) não apaga entrega já publicada localmente.
  if (local.status === "aguardando_conferencia" && cloud.status === "rascunho") {
    return false;
  }

  const localRank = STATUS_RANK[local.status] ?? 0;
  const cloudRank = STATUS_RANK[cloud.status] ?? 0;
  if (cloudRank < localRank) return false;

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

  const localPendingCloud = [...byId.values()].filter(
    (n) =>
      (n.status === "aguardando_conferencia" || n.status === "rejeitada") &&
      n.fotoNaNuvem &&
      getNotaCooperativaCnpj(data, n) === digits
  );
  const cloudPending = cloudNotas.filter((n) => n.status === "aguardando_conferencia");
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

export function mergeCloudNotasIntoData(
  data: AppData,
  cloudNotas: NotaPedido[],
  cnpj: string
): AppData {
  const digits = normalizeCnpj(cnpj);
  const byId = new Map(data.notasPedido.map((n) => [n.id, n]));
  let changed = false;

  for (const raw of cloudNotas) {
    const cn = normalizeCloudNotaForLocal(data, raw, cnpj);
    const local = byId.get(cn.id);
    const cloudNota: NotaPedido = {
      ...cn,
      cooperativaCnpj: digits,
      fotoNaNuvem: cn.fotoNaNuvem ?? Boolean(cn.fotoPedido || cn.fotosPedido?.length),
    };
    if (!local || shouldApplyCloudNota(local, cloudNota)) {
      let mergedNota = local ? mergeNotaComFotos(local, cloudNota) : cloudNota;
      if (local && cloudNota.status !== local.status) {
        mergedNota = {
          ...mergedNota,
          status: cloudNota.status,
          conferidaPor: cloudNota.conferidaPor,
          dataConferencia: cloudNota.dataConferencia,
          rejeitadaPor: cloudNota.rejeitadaPor,
          dataRejeicao: cloudNota.dataRejeicao,
          motivoRejeicao: cloudNota.motivoRejeicao,
          reenviadaEm: cloudNota.reenviadaEm,
          updatedAt: cloudNota.updatedAt,
        };
      }
      byId.set(mergedNota.id, mergedNota);
      changed = true;
    }
  }

  if (propagateCloudNotaDeletions(data, byId, cloudNotas, cnpj)) {
    changed = true;
  }

  if (!changed) return data;
  return { ...data, notasPedido: Array.from(byId.values()) };
}

export async function fetchNotasPedidoFromCloud(
  cnpj: string
): Promise<{ ok: boolean; notas: NotaPedido[] }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, notas: [] };

  try {
    const res = await fetch(`/api/notas-pedido?cnpj=${digits}&lite=1&previews=1`, { cache: "no-store" });
    if (!res.ok) return { ok: false, notas: [] };
    const json = await res.json().catch(() => ({}));
    const notas = ((json.notas ?? []) as unknown[])
      .map(mapRowToNota)
      .filter((n): n is NotaPedido => Boolean(n));
    return { ok: true, notas };
  } catch {
    return { ok: false, notas: [] };
  }
}

export async function fetchNotaPedidoFromCloud(
  cnpj: string,
  notaId: string
): Promise<NotaPedido | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;

  try {
    const res = await fetch(
      `/api/notas-pedido/${encodeURIComponent(notaId)}?cnpj=${digits}`,
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
      const res = await fetch("/api/notas-pedido", {
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

function loadPendingNotaDeletes(): { cnpj: string; notaId: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_NOTA_DELETES_KEY);
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
  if (typeof window === "undefined") return;
  if (entries.length === 0) localStorage.removeItem(PENDING_NOTA_DELETES_KEY);
  else localStorage.setItem(PENDING_NOTA_DELETES_KEY, JSON.stringify(entries));
}

export function queueNotaDelete(cnpj: string, notaId: string): void {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !notaId) return;
  const entries = loadPendingNotaDeletes();
  if (entries.some((e) => e.cnpj === digits && e.notaId === notaId)) return;
  savePendingNotaDeletes([...entries, { cnpj: digits, notaId }]);
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
    const res = await fetch(
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
    const res = await fetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}`, {
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

  const metaNota: NotaPedido = {
    ...nota,
    status: "rascunho",
    fotosEnviadasCount: totalCount,
    fotoNaNuvem: true,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
  };

  try {
    const res = await fetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}/foto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cnpj: digits,
        index,
        totalCount,
        foto: fotoDataUrl,
        draft: true,
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
    const res = await fetch(
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

  const finalNota: NotaPedido = {
    ...nota,
    status: "aguardando_conferencia",
    fotoNaNuvem: true,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
    updatedAt: new Date().toISOString(),
  };

  const patched = await patchNotaPedidoInCloud(digits, finalNota);
  if (!patched.ok) return patched;

  return { ok: true };
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

  const metaNota: NotaPedido = {
    ...nota,
    fotosEnviadasCount: totalCount,
    fotoNaNuvem: true,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
  };

  try {
    let startIndex = 0;
    try {
      const progressRes = await fetch(
        `/api/notas-pedido/${encodeURIComponent(nota.id)}?cnpj=${digits}&uploadProgress=1`
      );
      if (progressRes.ok) {
        const progressJson = await progressRes.json().catch(() => ({}));
        const uploaded = Number(progressJson.uploadedParts ?? 0);
        if (uploaded >= totalCount) return { ok: true };
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

      const res = await fetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}/foto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: digits,
          index: i,
          totalCount,
          foto,
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
  const { ok, notas: cloudNotas } = await fetchNotasPedidoFromCloud(cnpj);
  if (!ok) return 0;
  const current = getData();
  const merged = mergeCloudNotasIntoData(current, cloudNotas, cnpj);
  const reconciled = reconciliarFichaFromNotasConferidas(merged);
  if (reconciled !== current) {
    saveDataSafe(reconciled);
  }
  return cloudNotas.filter((n) => n.status === "aguardando_conferencia").length;
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
  const temSóMiniaturas =
    fullResCount === 0 && Boolean(nota.fotosPedidoMiniaturas?.length || nota.fotoPedidoMiniatura);

  if (esperado <= 0) return nota;
  if (fullResCount >= esperado && !temSóMiniaturas) return nota;

  const cnpj = getCooperativaCnpj(data, coopId ?? nota.cooperativaId);
  if (!cnpj) return nota;

  if (!nota.fotoNaNuvem && fullResCount === 0 && localFotos.length === 0) return nota;

  const cloud = await fetchNotaPedidoFromCloud(cnpj, nota.id);
  if (!cloud) return nota;

  const merged = mergeNotaComFotos(nota, cloud);
  const cloudFotos = getFotosExibicaoNota(merged);
  if (cloudFotos.length === 0) return nota;

  return merged;
}
