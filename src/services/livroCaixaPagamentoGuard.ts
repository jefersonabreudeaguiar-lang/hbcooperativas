import type { LivroCaixaExcluidoRef, LivroCaixaLancamento, PagamentoCooperadoRegistro } from "@/types";
import { pagamentoIdFromOrigemId } from "@/services/livroCaixaService";

export type OperacionalLivroCaixaSlice = {
  pagamentosCooperado?: PagamentoCooperadoRegistro[];
  livroCaixa?: LivroCaixaLancamento[];
  livroCaixaExcluidos?: LivroCaixaExcluidoRef[];
};

export type PreservarLivroCaixaPixResult<T extends OperacionalLivroCaixaSlice> = {
  payload: T;
  restauradas: string[];
};

function idsPagamentosConfirmados(
  ...listas: Array<PagamentoCooperadoRegistro[] | undefined>
): Set<string> {
  const ids = new Set<string>();
  for (const lista of listas) {
    for (const p of lista ?? []) {
      if (p.status === "confirmado" && p.id) ids.add(p.id);
    }
  }
  return ids;
}

export function linhaLivroCaixaDePixConfirmado(
  linha: LivroCaixaLancamento,
  confirmadoIds: Set<string>
): boolean {
  const pgId = pagamentoIdFromOrigemId(linha.origemId);
  return Boolean(pgId && confirmadoIds.has(pgId));
}

/**
 * Upload/pull não pode apagar débito/retenção de PIX confirmado.
 * Pagamento já é preservado no blob; o livro caixa não era — um aparelho
 * atrasado republicava operacional sem as linhas e o pago sumia do caixa.
 */
export function preservarLivroCaixaDePagamentosConfirmados<T extends OperacionalLivroCaixaSlice>(
  existing: T | null | undefined,
  incoming: T
): PreservarLivroCaixaPixResult<T> {
  if (!existing?.livroCaixa?.length) {
    return { payload: incoming, restauradas: [] };
  }

  const excluidos = new Set(
    (incoming.livroCaixaExcluidos ?? existing.livroCaixaExcluidos ?? []).map((e) => e.id)
  );
  const confirmados = idsPagamentosConfirmados(
    existing.pagamentosCooperado,
    incoming.pagamentosCooperado
  );
  if (confirmados.size === 0) {
    return { payload: incoming, restauradas: [] };
  }

  const incomingById = new Map((incoming.livroCaixa ?? []).map((l) => [l.id, l]));
  const incomingOrigem = new Set(
    (incoming.livroCaixa ?? []).map((l) => l.origemId).filter((id): id is string => Boolean(id))
  );
  const restauradas: string[] = [];
  const extra: LivroCaixaLancamento[] = [];

  for (const linha of existing.livroCaixa) {
    if (excluidos.has(linha.id)) continue;
    if (!linhaLivroCaixaDePixConfirmado(linha, confirmados)) continue;
    if (incomingById.has(linha.id)) continue;
    if (linha.origemId && incomingOrigem.has(linha.origemId)) continue;
    extra.push(linha);
    restauradas.push(linha.id);
  }

  if (extra.length === 0) {
    return { payload: incoming, restauradas };
  }
  return {
    payload: { ...incoming, livroCaixa: [...(incoming.livroCaixa ?? []), ...extra] },
    restauradas,
  };
}

export function aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional<
  T extends OperacionalLivroCaixaSlice,
>(existing: T | null | undefined, incoming: T): PreservarLivroCaixaPixResult<T> {
  return preservarLivroCaixaDePagamentosConfirmados(existing, incoming);
}
