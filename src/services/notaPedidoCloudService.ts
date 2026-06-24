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
  const digits = normalizeCnpj(cnpj);
  const cloudIds = new Set(cloudNotas.map((n) => n.id));
  const byId = new Map(data.notasPedido.map((n) => [n.id, n]));
  let changed = false;

  for (const raw of cloudNotas) {
    const cn = normalizeCloudNotaForLocal(data, raw, cnpj);
    const mergedNota: NotaPedido = {
      ...cn,
      cooperativaCnpj: digits,
      fotoNaNuvem: cn.fotoNaNuvem ?? Boolean(cn.fotoPedido || cn.fotosPedido?.length),
    };
    const local = byId.get(mergedNota.id);
    if (shouldApplyCloudNota(local, mergedNota)) {
      byId.set(mergedNota.id, mergedNota);
      changed = true;
    }
  }

  // Entrega excluída na nuvem some localmente só se já tinha sido sincronizada.
  for (const [id, n] of [...byId.entries()]) {
    if (cloudIds.has(id)) continue;
    if (n.status !== "aguardando_conferencia" && n.status !== "rejeitada") continue;
    const notaCnpj = getNotaCooperativaCnpj(data, n);
    if (notaCnpj !== digits) continue;
    if (!n.fotoNaNuvem) continue;
    byId.delete(id);
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
    const res = await fetch(`/api/notas-pedido?cnpj=${digits}`, { cache: "no-store" });
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
