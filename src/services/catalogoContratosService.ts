import type { AppData, Instituicao, ProdutoInstituicao } from "@/types";
import { sortPorOrdemLancamento } from "@/utils/produtos";
import { idsInstituicoesExcluidas } from "@/services/instituicaoContratoService";

export function getInstituicoesCatalogo(data: AppData, cooperativaId?: string): Instituicao[] {
  const excluidas = idsInstituicoesExcluidas(data, cooperativaId);
  return data.instituicoes.filter(
    (i) => !excluidas.has(i.id) && (!cooperativaId || i.cooperativaId === cooperativaId)
  );
}

/** Produtos ativos do contrato — mesma lista que o responsável cadastrou. */
export function getProdutosContrato(
  data: AppData,
  instituicaoId: string,
  cooperativaId?: string
): ProdutoInstituicao[] {
  return sortPorOrdemLancamento(
    data.produtosInstituicao.filter(
      (p) =>
        p.instituicaoId === instituicaoId &&
        p.ativo &&
        p.precoUnitario > 0 &&
        (!cooperativaId || p.cooperativaId === cooperativaId)
    )
  );
}

/** Todos os produtos ativos da cooperativa (todas as instituições). */
export function getTodosProdutosCatalogo(data: AppData, cooperativaId?: string): ProdutoInstituicao[] {
  const instIds = new Set(getInstituicoesCatalogo(data, cooperativaId).map((i) => i.id));
  return sortPorOrdemLancamento(
    data.produtosInstituicao.filter(
      (p) =>
        p.ativo &&
        p.precoUnitario > 0 &&
        (!cooperativaId || p.cooperativaId === cooperativaId) &&
        (instIds.has(p.instituicaoId) || !cooperativaId)
    )
  );
}

export function instituicaoTemItensCatalogo(
  data: AppData,
  instituicaoId: string,
  cooperativaId?: string
): boolean {
  return getProdutosContrato(data, instituicaoId, cooperativaId).length > 0;
}

/** Contratos publicados pelo responsável — instituição com ao menos 1 item ativo e preço > 0. */
export function getContratosEntregaValidos(data: AppData, cooperativaId: string): Instituicao[] {
  return getInstituicoesCatalogo(data, cooperativaId).filter((i) =>
    instituicaoTemItensCatalogo(data, i.id, cooperativaId)
  );
}

export function contratoValidoNoCatalogo(
  data: AppData,
  instituicaoId: string,
  cooperativaId: string
): boolean {
  return getContratosEntregaValidos(data, cooperativaId).some((i) => i.id === instituicaoId);
}

export function contarItensCatalogo(data: AppData, cooperativaId?: string): number {
  return getTodosProdutosCatalogo(data, cooperativaId).length;
}
