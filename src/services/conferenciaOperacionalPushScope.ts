/**
 * H8.9.237 — Escopo de push operacional pós-conferência (somente leitura via getData view).
 * Evita republicar ficha/nota conferida local antes do PATCH correspondente na fila FIFO.
 */
import type { AppData } from "@/types";

type ActiveScope = { coopId: string; allowedNotaIds: ReadonlySet<string> };

let activeScope: ActiveScope | null = null;

export function isConferenciaOperacionalPushScopeActive(): boolean {
  return activeScope !== null;
}

export function getConferenciaOperacionalPushCoopId(): string | null {
  return activeScope?.coopId ?? null;
}

export function enterConferenciaOperacionalPushScope(
  coopId: string,
  allowedNotaIds: ReadonlySet<string>
): void {
  activeScope = { coopId, allowedNotaIds };
}

export function exitConferenciaOperacionalPushScope(): void {
  activeScope = null;
}

export async function withConferenciaOperacionalPushScope<T>(
  coopId: string,
  allowedNotaIds: ReadonlySet<string>,
  fn: () => Promise<T>
): Promise<T> {
  enterConferenciaOperacionalPushScope(coopId, allowedNotaIds);
  try {
    return await fn();
  } finally {
    exitConferenciaOperacionalPushScope();
  }
}

/** View read-only: pagamentos e demais fatias financeiras intactos. */
export function applyConferenciaOperacionalPushView(data: AppData, coopId: string, allowed: ReadonlySet<string>): AppData {
  const notasPedido = data.notasPedido.map((n) => {
    if (n.cooperativaId !== coopId) return n;
    if (allowed.has(n.id)) return n;
    if (n.status === "conferida") {
      return {
        ...n,
        status: "aguardando_conferencia" as const,
        conferidaPor: undefined,
        dataConferencia: undefined,
      };
    }
    return n;
  });

  const fichaCorrida = data.fichaCorrida.filter((f) => {
    if (f.cooperativaId !== coopId) return true;
    if (!f.notaPedidoId) return true;
    if (f.status === "pago") return true;
    return allowed.has(f.notaPedidoId);
  });

  const arquivosMensais = data.arquivosMensais.map((a) => {
    if (a.cooperativaId !== coopId) return a;
    const notaPedidoIds = a.notaPedidoIds.filter((id) => allowed.has(id));
    if (notaPedidoIds.length === a.notaPedidoIds.length) return a;
    return { ...a, notaPedidoIds };
  });

  return { ...data, notasPedido, fichaCorrida, arquivosMensais };
}

export function applyConferenciaOperacionalPushViewIfActive(data: AppData): AppData {
  if (!activeScope) return data;
  return applyConferenciaOperacionalPushView(data, activeScope.coopId, activeScope.allowedNotaIds);
}

/** Evita persistir view filtrada durante push operacional scoped. */
export function preserveOperationalTruthDuringConferenciaPushSave(
  persistedCandidate: AppData,
  truth: AppData
): AppData {
  if (!activeScope) return persistedCandidate;
  return {
    ...persistedCandidate,
    notasPedido: truth.notasPedido,
    fichaCorrida: truth.fichaCorrida,
    arquivosMensais: truth.arquivosMensais,
  };
}

const STATUS_RANK: Record<string, number> = {
  rascunho: 0,
  entregue: 1,
  aguardando_conferencia: 2,
  rejeitada: 3,
  conferida: 4,
  pago: 5,
  cancelado: 6,
};

function statusRank(status: string | undefined): number {
  if (!status) return -1;
  return STATUS_RANK[status] ?? 0;
}

/**
 * Durante conferência (modal / batch / lançamento), sync não pode apagar decisão local
 * nem lançamentos parciais multi-foto ainda não refletidos na nuvem.
 */
export function preserveConferenciaInProgressOperationalTruth(
  incoming: AppData,
  truth: AppData
): AppData {
  const truthNotaById = new Map(truth.notasPedido.map((n) => [n.id, n]));
  const incomingIds = new Set(incoming.notasPedido.map((n) => n.id));

  const notasPedido = incoming.notasPedido.map((n) => {
    const t = truthNotaById.get(n.id);
    if (!t) return n;
    const rankT = statusRank(t.status);
    const rankN = statusRank(n.status);
    if (rankT > rankN) return t;
    if (rankT === rankN && t.updatedAt && n.updatedAt && t.updatedAt > n.updatedAt) return t;
    return n;
  });

  for (const t of truth.notasPedido) {
    if (!incomingIds.has(t.id) && (t.status === "conferida" || t.status === "rejeitada")) {
      notasPedido.push(t);
    }
  }

  const incomingFichaIds = new Set(incoming.fichaCorrida.map((f) => f.id));
  const fichasExtra = truth.fichaCorrida.filter((f) => {
    if (incomingFichaIds.has(f.id)) return false;
    if (!f.notaPedidoId) return false;
    const t = truthNotaById.get(f.notaPedidoId);
    if (!t) return false;
    return t.status === "aguardando_conferencia" || t.status === "conferida";
  });

  const fichaCorrida =
    fichasExtra.length > 0 ? [...incoming.fichaCorrida, ...fichasExtra] : incoming.fichaCorrida;

  const truthArqByKey = new Map(
    truth.arquivosMensais.map((a) => [`${a.cooperadoId}:${a.mesReferencia}:${a.cooperativaId}`, a])
  );
  const arquivosMensais = incoming.arquivosMensais.map((a) => {
    const key = `${a.cooperadoId}:${a.mesReferencia}:${a.cooperativaId}`;
    const t = truthArqByKey.get(key);
    if (!t || t.notaPedidoIds.length <= a.notaPedidoIds.length) return a;
    const mergedIds = new Set([...a.notaPedidoIds, ...t.notaPedidoIds]);
    return { ...a, notaPedidoIds: [...mergedIds] };
  });

  return { ...incoming, notasPedido, fichaCorrida, arquivosMensais };
}
