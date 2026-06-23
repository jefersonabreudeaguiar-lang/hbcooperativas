import type { AppData, NotaPedido, User } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { fetchCooperativaByCnpjFromCloud } from "@/services/cooperativaCloudService";
import { getNotaCooperativaCnpj, getFotosExibicaoNota } from "@/utils/fotoEntrega";
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

export function mergeCloudNotasIntoData(
  data: AppData,
  cloudNotas: NotaPedido[],
  cnpj: string
): AppData {
  if (cloudNotas.length === 0) {
    const digits = normalizeCnpj(cnpj);
    let removed = false;
    const notasPedido = data.notasPedido.filter((n) => {
      if (n.status !== "aguardando_conferencia") return true;
      const notaCnpj = getNotaCooperativaCnpj(data, n);
      if (notaCnpj !== digits) return true;
      if (n.fotoNaNuvem || n.cooperativaCnpj) {
        removed = true;
        return false;
      }
      return true;
    });
    return removed ? { ...data, notasPedido } : data;
  }

  const digits = normalizeCnpj(cnpj);
  const cloudIds = new Set(cloudNotas.map((n) => n.id));
  const byId = new Map(data.notasPedido.map((n) => [n.id, n]));
  let changed = false;

  for (const raw of cloudNotas) {
    const cn = normalizeCloudNotaForLocal(data, raw, cnpj);
    const local = byId.get(cn.id);
    if (shouldApplyCloudNota(local, cn)) {
      byId.set(cn.id, cn);
      changed = true;
    }
  }

  for (const [id, n] of [...byId.entries()]) {
    if (n.status !== "aguardando_conferencia") continue;
    const notaCnpj = getNotaCooperativaCnpj(data, n);
    if (notaCnpj !== digits) continue;
    if ((n.fotoNaNuvem || n.cooperativaCnpj) && !cloudIds.has(id)) {
      const ageMs = Date.now() - new Date(n.updatedAt).getTime();
      if (ageMs < 3 * 60 * 1000) continue;
      byId.delete(id);
      changed = true;
    }
  }

  if (!changed) return data;
  return { ...data, notasPedido: Array.from(byId.values()) };
}

export async function fetchNotasPedidoFromCloud(cnpj: string): Promise<NotaPedido[]> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return [];

  try {
    const res = await fetch(`/api/notas-pedido?cnpj=${digits}`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    return ((json.notas ?? []) as unknown[])
      .map(mapRowToNota)
      .filter((n): n is NotaPedido => Boolean(n));
  } catch {
    return [];
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
        return { ok: false, error: (json.error as string) ?? "Erro ao enviar para a cooperativa." };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, offline: true, error: "Sem conexão com o servidor." };
  }
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
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  try {
    await fetch(`/api/notas-pedido/${encodeURIComponent(nota.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, nota }),
    });
  } catch {
    /* offline */
  }
}

export async function syncNotasPedidoFromCloud(cnpj: string): Promise<number> {
  if (needsOperationalResetCloudPush()) return 0;
  const cloudNotas = await fetchNotasPedidoFromCloud(cnpj);
  const current = getData();
  const merged =
    cloudNotas.length > 0 ? mergeCloudNotasIntoData(current, cloudNotas, cnpj) : current;
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
  if (getFotosExibicaoNota(nota).length > 0) return nota;
  const cnpj = getCooperativaCnpj(data, coopId ?? nota.cooperativaId);
  if (!cnpj) return nota;
  const cloud = await fetchNotaPedidoFromCloud(cnpj, nota.id);
  if (cloud?.fotosPedido?.length) {
    return {
      ...nota,
      fotosPedido: cloud.fotosPedido,
      fotoPedido: cloud.fotoPedido ?? cloud.fotosPedido[0],
      fotoNaNuvem: true,
    };
  }
  if (cloud?.fotoPedido) {
    return { ...nota, fotoPedido: cloud.fotoPedido, fotoNaNuvem: true };
  }
  return nota;
}
