/**
 * Fila local quando a entrega já publicou na nuvem (finalize OK) mas o AppData
 * não coube no localStorage — reconcilia sem reenviar fotos nem rebaixar status.
 */

import type { AppData, NotaPedido } from "@/types";
import { addAuditEntry, getData, getSession, updateDataSafe } from "@/services/dataStore";
import {
  fetchNotaPedidoFromCloud,
  finalizeNotaEntregaNaNuvem,
} from "@/services/notaPedidoCloudService";
import { compactarFotosNoArmazenamento, liberarEspacoArmazenamento } from "@/utils/fotoEntrega";
import { normalizeCnpj } from "@/utils/cooperativa";

const STORAGE_KEY = "coopeagriplla_pending_entrega_publish";
const MAX_ATTEMPTS = 12;

export type PendingEntregaPublishEntry = {
  cnpj: string;
  cooperativaId: string;
  userId: string;
  userName: string;
  cooperadoNome?: string;
  nota: NotaPedido;
  reenvio: boolean;
  qtdFotos: number;
  queuedAt: string;
  attempts: number;
  lastError?: string;
};

function storage(): Storage | null {
  if (typeof window !== "undefined") return window.localStorage;
  const g = globalThis as { localStorage?: Storage };
  return g.localStorage ?? null;
}

function loadAll(): PendingEntregaPublishEntry[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingEntregaPublishEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e?.nota?.id && e.cnpj && e.userId);
  } catch {
    return [];
  }
}

function saveAll(entries: PendingEntregaPublishEntry[]): void {
  const s = storage();
  if (!s) return;
  if (entries.length === 0) s.removeItem(STORAGE_KEY);
  else s.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function listPendingEntregaPublish(filter?: {
  cnpj?: string;
  userId?: string;
}): PendingEntregaPublishEntry[] {
  const digits = filter?.cnpj ? normalizeCnpj(filter.cnpj) : "";
  return loadAll().filter((e) => {
    if (digits.length === 14 && normalizeCnpj(e.cnpj) !== digits) return false;
    if (filter?.userId && e.userId !== filter.userId) return false;
    return true;
  });
}

export function countPendingEntregaPublish(filter?: {
  cnpj?: string;
  userId?: string;
}): number {
  return listPendingEntregaPublish(filter).length;
}

export function queuePendingEntregaPublish(
  entry: Omit<PendingEntregaPublishEntry, "queuedAt" | "attempts">
): void {
  const digits = normalizeCnpj(entry.cnpj);
  if (digits.length !== 14 || !entry.nota.id) return;
  const all = loadAll().filter((e) => e.nota.id !== entry.nota.id);
  saveAll([
    ...all,
    {
      ...entry,
      cnpj: digits,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    },
  ]);
}

export function unqueuePendingEntregaPublish(cnpj: string, notaId: string): void {
  const digits = normalizeCnpj(cnpj);
  if (!notaId) return;
  saveAll(
    loadAll().filter(
      (e) => !(normalizeCnpj(e.cnpj) === digits && e.nota.id === notaId)
    )
  );
}

function persistNotaEntregaLocal(
  d: AppData,
  entry: PendingEntregaPublishEntry
): AppData {
  const { nota, userId, userName, reenvio, qtdFotos } = entry;
  const notaFinal: NotaPedido = {
    ...nota,
    status: "aguardando_conferencia",
    fotoNaNuvem: true,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
  };

  const base = compactarFotosNoArmazenamento(liberarEspacoArmazenamento(d, 1));

  if (reenvio) {
    const updated = base.notasPedido.map((n) => (n.id === notaFinal.id ? notaFinal : n));
    return addAuditEntry({ ...base, notasPedido: updated }, {
      entityType: "nota_pedido",
      entityId: notaFinal.id,
      action: "editar",
      userId,
      userName,
      changes: "Entrega reenviada (reconciliação local)",
    });
  }

  const exists = base.notasPedido.some((n) => n.id === notaFinal.id);
  const notasPedido = exists
    ? base.notasPedido.map((n) => (n.id === notaFinal.id ? notaFinal : n))
    : [...base.notasPedido, notaFinal];

  return addAuditEntry({ ...base, notasPedido }, {
    entityType: "nota_pedido",
    entityId: notaFinal.id,
    action: exists ? "editar" : "criar",
    userId,
    userName,
    changes: qtdFotos > 1 ? `1 entrega com ${qtdFotos} fotos (reconciliação)` : "1 entrega com foto (reconciliação)",
  });
}

function tryPersistEntry(entry: PendingEntregaPublishEntry): { ok: boolean; error?: string } {
  let saved = updateDataSafe((d) => persistNotaEntregaLocal(d, entry));
  if (saved.ok) return { ok: true };

  saved = updateDataSafe((d) =>
    persistNotaEntregaLocal(liberarEspacoArmazenamento(d, 2), entry)
  );
  if (saved.ok) return { ok: true };

  saved = updateDataSafe((d) =>
    persistNotaEntregaLocal(
      liberarEspacoArmazenamento(compactarFotosNoArmazenamento(d), 2),
      entry
    )
  );
  if (saved.ok) return { ok: true };

  return { ok: false, error: saved.error };
}

function bumpAttempt(entry: PendingEntregaPublishEntry, error: string): void {
  const all = loadAll();
  const next = all.map((e) =>
    e.nota.id === entry.nota.id
      ? { ...e, attempts: e.attempts + 1, lastError: error }
      : e
  );
  saveAll(next.filter((e) => e.attempts < MAX_ATTEMPTS));
}

/** Confirma publicação na nuvem (idempotente) e grava nota localmente. */
export async function reconcilePendingEntregaPublish(opts?: {
  cnpj?: string;
  userId?: string;
  userName?: string;
}): Promise<{ reconciled: number; remaining: number }> {
  const session = getSession();
  const userId = opts?.userId ?? session?.id;
  const userName = opts?.userName ?? session?.name ?? "Cooperado";
  if (!userId) {
    return { reconciled: 0, remaining: listPendingEntregaPublish(opts).length };
  }

  let entries = listPendingEntregaPublish({ ...opts, userId });
  if (entries.length === 0) return { reconciled: 0, remaining: 0 };

  let reconciled = 0;

  for (const entry of entries) {
    const digits = normalizeCnpj(entry.cnpj);
    const local = getData().notasPedido.find((n) => n.id === entry.nota.id);
    if (
      local?.status === "aguardando_conferencia" &&
      local.fotoNaNuvem
    ) {
      unqueuePendingEntregaPublish(digits, entry.nota.id);
      reconciled += 1;
      continue;
    }

    const cloud = await fetchNotaPedidoFromCloud(digits, entry.nota.id, { metaOnly: true });
    if (cloud?.status === "rascunho") {
      const fin = await finalizeNotaEntregaNaNuvem(
        digits,
        entry.nota,
        entry.cooperadoNome
      );
      if (!fin.ok && !fin.offline) {
        bumpAttempt(entry, fin.error ?? "Falha ao republicar entrega.");
        continue;
      }
    }

    const persisted = tryPersistEntry(entry);
    if (persisted.ok) {
      unqueuePendingEntregaPublish(digits, entry.nota.id);
      reconciled += 1;
    } else {
      bumpAttempt(entry, persisted.error ?? "Sem espaço no aparelho.");
    }
  }

  entries = listPendingEntregaPublish({ ...opts, userId });
  return { reconciled, remaining: entries.length };
}
