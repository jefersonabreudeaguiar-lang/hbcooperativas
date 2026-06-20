import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { getData, saveDataSafe } from "@/services/dataStore";

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
  const existeLocal = data.cooperados.some(
    (c) => c.id === cooperadoId && c.cooperativaId === coop.id
  );

  if (!existeLocal && nota.cooperadoNomeSnapshot) {
    const nome = nota.cooperadoNomeSnapshot.trim().toLowerCase();
    const match = data.cooperados.find(
      (c) =>
        c.cooperativaId === coop.id &&
        c.nomeCompleto.trim().toLowerCase() === nome
    );
    if (match) cooperadoId = match.id;
  }

  return {
    ...nota,
    cooperativaId: coop.id,
    cooperadoId,
    cooperativaCnpj: digits,
  };
}

export function mergeCloudNotasIntoData(
  data: AppData,
  cloudNotas: NotaPedido[],
  cnpj: string
): AppData {
  if (cloudNotas.length === 0) return data;
  const byId = new Map(data.notasPedido.map((n) => [n.id, n]));
  let changed = false;

  for (const raw of cloudNotas) {
    const cn = normalizeCloudNotaForLocal(data, raw, cnpj);
    const local = byId.get(cn.id);
    if (!local || new Date(cn.updatedAt).getTime() >= new Date(local.updatedAt).getTime()) {
      byId.set(cn.id, cn);
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
    if (json.migrationPending) return [];
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

export async function pushNotasPedidoToCloud(
  cnpj: string,
  notas: NotaPedido[],
  cooperadoNome?: string
): Promise<{ ok: boolean; offline?: boolean; migrationPending?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || notas.length === 0) return { ok: true };

  try {
    const res = await fetch("/api/notas-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, notas, cooperadoNome }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) {
      return {
        ok: false,
        offline: true,
        migrationPending: Boolean(json.migrationPending),
        error: json.error as string | undefined,
      };
    }
    if (!res.ok) return { ok: false, error: (json.error as string) ?? "Erro ao enviar para a cooperativa." };
    return { ok: true };
  } catch {
    return { ok: false, offline: true, error: "Sem conexão com o servidor." };
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
  const cloudNotas = await fetchNotasPedidoFromCloud(cnpj);
  if (cloudNotas.length === 0) return 0;
  const current = getData();
  const merged = mergeCloudNotasIntoData(current, cloudNotas, cnpj);
  if (merged === current) return 0;
  saveDataSafe(merged);
  return cloudNotas.filter((n) => n.status === "aguardando_conferencia").length;
}

export function getCooperativaCnpj(data: AppData, cooperativaId?: string): string | undefined {
  if (!cooperativaId) return undefined;
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cnpj = normalizeCnpj(coop?.cnpj ?? "");
  return cnpj.length === 14 ? cnpj : undefined;
}

export async function ensureNotaComFoto(
  data: AppData,
  nota: NotaPedido,
  coopId?: string
): Promise<NotaPedido> {
  if (nota.fotoPedido) return nota;
  const cnpj = getCooperativaCnpj(data, coopId ?? nota.cooperativaId);
  if (!cnpj) return nota;
  const cloud = await fetchNotaPedidoFromCloud(cnpj, nota.id);
  if (cloud?.fotoPedido) {
    return { ...nota, fotoPedido: cloud.fotoPedido, fotoNaNuvem: true };
  }
  return nota;
}
