/**
 * Crédito-base HB = ficha em aberto de cada cooperado.
 * Mês já liquidado (PIX confirmado cobrindo a ficha) não entra no lastro nem no a receber.
 */
import type { AppData } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getResumoValorAPagarRelatorio, listarFichasEmAbertoPagamento } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";

type EntregasMod = typeof import("@/services/cooperadoEntregasService");

function loadEntregas(): EntregasMod {
  return require("@/services/cooperadoEntregasService") as EntregasMod;
}

function mesesEmAbertoFicha(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string[] {
  const fn = loadEntregas().listarMesesEmAbertoPagamentoResponsavel;
  if (typeof fn === "function") {
    const meses = fn(data, cooperadoId, cooperativaId);
    if (Array.isArray(meses)) return meses;
  }
  const vistos = new Set<string>();
  for (const f of data.fichaCorrida ?? []) {
    if (f.mesReferencia) vistos.add(f.mesReferencia);
  }
  return [...vistos]
    .filter((mes) => listarFichasEmAbertoPagamento(data, cooperadoId, mes, cooperativaId).length > 0)
    .sort();
}

/**
 * Crédito-base HB (limite/teto) — só ficha ainda sem PIX.
 * Mês passado já pago = 0; lançamento novo no mês seguinte soma sozinho.
 */
export function hbCreditCreditoBaseReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return 0;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = mesesEmAbertoFicha(data, canonico, coopId);
  let bruto = 0;
  let liquido = 0;
  for (const mes of meses) {
    if (listarFichasEmAbertoPagamento(data, canonico, mes, coopId).length === 0) continue;
    const r = getResumoValorAPagarRelatorio(data, canonico, mes, coopId);
    bruto += Number(r.valorBruto) || 0;
    liquido += Number(r.valorLiquido) || 0;
  }
  if (bruto > 0.005) return round2(bruto);
  if (liquido > 0.005) return round2(liquido);
  return 0;
}
