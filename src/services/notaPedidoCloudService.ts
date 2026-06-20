import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { getData, saveDataSafe } from "@/services/dataStore";

function mapRowToNota(row: Record<string, unknown>): NotaPedido | null {
  const payload = row.payload as NotaPedido | undefined;
  if (payload?.id) return payload;
  return null;
}

export function mergeCloudNotasIntoData(data: AppData, cloudNotas: NotaPedido[]): AppData {
  if (cloudNotas.length === 0) return data;
  const byId = new Map(data.notasPedido.map((n) => [n.id, n]));
  let changed = false;

  for (const cn of cloudNotas) {
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
    const rows = (json.notas ?? []) as Record<string, unknown>[];
    return rows.map(mapRowToNota).filter((n): n is NotaPedido => Boolean(n));
  } catch {
    return [];
  }
}

export async function pushNotasPedidoToCloud(
  cnpj: string,
  notas: NotaPedido[],
  cooperadoNome?: string
): Promise<{ ok: boolean; offline?: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || notas.length === 0) return { ok: true };

  try {
    const res = await fetch("/api/notas-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, notas, cooperadoNome }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) return { ok: false, offline: true, error: json.error as string | undefined };
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
    /* offline — dados locais permanecem */
  }
}

export async function syncNotasPedidoFromCloud(cnpj: string): Promise<void> {
  const cloudNotas = await fetchNotasPedidoFromCloud(cnpj);
  if (cloudNotas.length === 0) return;
  const current = getData();
  const merged = mergeCloudNotasIntoData(current, cloudNotas);
  if (merged === current) return;
  saveDataSafe(merged);
}

export function getCooperativaCnpj(data: AppData, cooperativaId?: string): string | undefined {
  if (!cooperativaId) return undefined;
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cnpj = normalizeCnpj(coop?.cnpj ?? "");
  return cnpj.length === 14 ? cnpj : undefined;
}
