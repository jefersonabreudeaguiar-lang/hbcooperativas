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
