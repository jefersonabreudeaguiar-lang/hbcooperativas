/**
 * Crédito-base HB = soma da ficha ainda sem PIX de cada cooperado.
 * Não usa snapshot de pagamento (valorBruto do PIX antigo reabria mês liquidado).
 */
import type { AppData } from "@/types";
import { fichaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { listarFichasEmAbertoPagamento } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";

function valorFichaEmAberto(ficha: { valorBruto?: number; valorLiquido?: number }): number {
  const bruto = Number(ficha.valorBruto);
  if (Number.isFinite(bruto) && bruto > 0) return bruto;
  const liquido = Number(ficha.valorLiquido);
  return Number.isFinite(liquido) && liquido > 0 ? liquido : 0;
}

export type MesFichaEmAberto = {
  mes: string;
  entregas: number;
  total: number;
};

/** Mesma janela do HB e do «em aberto» do conferir: só ficha ainda sem PIX. */
export function listarMesesFichaEmAbertoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): { meses: string[]; porMes: MesFichaEmAberto[]; total: number } {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return { meses: [], porMes: [], total: 0 };
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const mesesSet = new Set<string>();
  for (const f of data.fichaCorrida ?? []) {
    if (!fichaPertenceCooperado(data, f, canonico, coopId)) continue;
    if (f.mesReferencia) mesesSet.add(f.mesReferencia);
  }
  const porMes: MesFichaEmAberto[] = [];
  let total = 0;
  for (const mes of [...mesesSet].sort()) {
    const fichas = listarFichasEmAbertoPagamento(data, canonico, mes, coopId);
    if (!fichas.length) continue;
    const mesTotal = round2(fichas.reduce((s, f) => s + valorFichaEmAberto(f), 0));
    if (mesTotal <= 0.005) continue;
    porMes.push({ mes, entregas: fichas.length, total: mesTotal });
    total = round2(total + mesTotal);
  }
  return { meses: porMes.map((m) => m.mes), porMes, total };
}

/**
 * Crédito-base HB (limite/teto) — só lançamento da ficha ainda não liquidado.
 * Mês passado com PIX confirmado = 0; entrega depois do pagamento soma sozinha.
 */
export function hbCreditCreditoBaseReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  return listarMesesFichaEmAbertoCooperado(data, cooperadoId, cooperativaId).total;
}
