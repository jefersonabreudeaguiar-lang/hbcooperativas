import type { NotaPedido, NotaPedidoStatus } from "@/types";

/** Ranking de ciclo de vida — nunca rebaixar (ex.: conferida → aguardando). */
export const NOTA_STATUS_RANK: Record<NotaPedidoStatus, number> = {
  rascunho: 0,
  aguardando_conferencia: 1,
  rejeitada: 1,
  entregue: 2,
  conferida: 2,
  pago: 3,
  cancelado: 3,
};

export function notaStatusRank(status: NotaPedidoStatus | undefined | null): number {
  if (!status) return -1;
  return NOTA_STATUS_RANK[status] ?? 0;
}

/** True se `incoming` for um rebaixamento em relação a `existing`. */
export function isNotaStatusDowngrade(
  existing: NotaPedidoStatus | undefined | null,
  incoming: NotaPedidoStatus | undefined | null
): boolean {
  if (!existing || !incoming) return false;
  return notaStatusRank(incoming) < notaStatusRank(existing);
}

/** Status terminal de conferência/pagamento — mural do cooperado não deve listar como pendente. */
export function isNotaStatusTerminalConferencia(status: NotaPedidoStatus): boolean {
  return status === "conferida" || status === "pago" || status === "cancelado";
}

/**
 * Impede que push/PATCH do cooperado (ou foto tardia) apague conferência do responsável.
 * Mantém campos financeiros e de conferência do status mais avançado.
 */
export function protectNotaAgainstStatusDowngrade(
  existing: Pick<NotaPedido, "status"> & Partial<NotaPedido>,
  incoming: NotaPedido
): NotaPedido {
  if (!isNotaStatusDowngrade(existing.status, incoming.status)) {
    return incoming;
  }

  const keepFinance =
    existing.status === "conferida" ||
    existing.status === "pago" ||
    existing.status === "entregue";

  return {
    ...incoming,
    status: existing.status,
    conferidaPor: existing.conferidaPor ?? incoming.conferidaPor,
    dataConferencia: existing.dataConferencia ?? incoming.dataConferencia,
    rejeitadaPor: existing.rejeitadaPor ?? incoming.rejeitadaPor,
    dataRejeicao: existing.dataRejeicao ?? incoming.dataRejeicao,
    motivoRejeicao: existing.motivoRejeicao ?? incoming.motivoRejeicao,
    ...(keepFinance
      ? {
          itens: existing.itens ?? incoming.itens,
          valorBruto: existing.valorBruto ?? incoming.valorBruto,
          valorDesconto: existing.valorDesconto ?? incoming.valorDesconto,
          valorLiquido: existing.valorLiquido ?? incoming.valorLiquido,
          percentualDescontoCooperativa:
            existing.percentualDescontoCooperativa ?? incoming.percentualDescontoCooperativa,
          divisaoEntrega: existing.divisaoEntrega ?? incoming.divisaoEntrega,
        }
      : {}),
    fotosEnviadasCount: Math.max(existing.fotosEnviadasCount ?? 0, incoming.fotosEnviadasCount ?? 0),
    fotoNaNuvem: Boolean(existing.fotoNaNuvem || incoming.fotoNaNuvem),
    // Não avançar updatedAt com payload rebaixado — evita ganhar no merge por tempo.
    updatedAt: existing.updatedAt ?? incoming.updatedAt,
  };
}

/** Escolhe o status de maior rank (empate → o de updatedAt mais recente). */
export function pickHigherNotaStatus(
  a: NotaPedidoStatus,
  b: NotaPedidoStatus,
  aUpdatedAt?: string,
  bUpdatedAt?: string
): NotaPedidoStatus {
  const ra = notaStatusRank(a);
  const rb = notaStatusRank(b);
  if (ra > rb) return a;
  if (rb > ra) return b;
  const ta = aUpdatedAt ? new Date(aUpdatedAt).getTime() : 0;
  const tb = bUpdatedAt ? new Date(bUpdatedAt).getTime() : 0;
  return tb > ta ? b : a;
}
