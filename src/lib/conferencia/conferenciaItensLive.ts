import type { MutableRefObject } from "react";
import { calcularItensNota } from "@/services/notaPedidoService";

export function resolveConferenciaItensLive<T extends { quantidade: number }>(
  liveRef: MutableRefObject<T[]>,
  stateItems: T[]
): T[] {
  if (liveRef.current.length > 0) return liveRef.current;
  return stateItems;
}

/** Mesma base do lançamento na conferência (valorBruto derivado dos itens no motor). */
type ItemQtyLinha = {
  quantidade: number;
  precoUnitario: number;
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
};

export function calcularTotaisConferenciaItens(
  itens: ItemQtyLinha[],
  descontoPct: number
): { liquido: number; bruto: number; desconto: number } {
  const r = calcularItensNota(
    itens.map((i) => ({ ...i, valorBruto: 0 })),
    descontoPct
  );
  return { liquido: r.valorLiquido, bruto: r.valorBruto, desconto: r.valorDesconto };
}
