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

/**
 * Crédito-base HB (limite/teto) — só lançamento da ficha ainda não liquidado.
 * Mês passado com PIX confirmado = 0; entrega depois do pagamento soma sozinha.
 */
export function hbCreditCreditoBaseReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return 0;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = new Set<string>();
  for (const f of data.fichaCorrida ?? []) {
    if (!fichaPertenceCooperado(data, f, canonico, coopId)) continue;
    if (f.mesReferencia) meses.add(f.mesReferencia);
  }
  let total = 0;
  for (const mes of meses) {
    for (const f of listarFichasEmAbertoPagamento(data, canonico, mes, coopId)) {
      total += valorFichaEmAberto(f);
    }
  }
  return round2(total);
}
