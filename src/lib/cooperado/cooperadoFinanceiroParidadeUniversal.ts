/**
 * Lei universal do app — qualquer cooperativa/cooperado/responsável:
 * mesma ficha, mesmo resumo (incl. HB compras/estornos) e mesmo valor a receber.
 * Responsável projeta no operacional; cooperado lê o mesmo motor após sync.
 */
import type { AppData } from "@/types";
import type { FichaCorridaDesconto } from "@/types";
import {
  getConsolidadoFinanceiroCooperado,
  listarMesesReferenciaResumoFinanceiroParidade,
  type ConsolidadoFinanceiroCooperado,
} from "@/services/cooperadoEntregasService";
import { getDescontosExtrasExibicaoCooperadoFinanceiro } from "@/services/notaPedidoService";

export type LeituraFinanceiraParidadeCooperado = {
  consolidado: ConsolidadoFinanceiroCooperado;
  mesesResumo: string[];
  valorLiquido: number;
  mesLabel: string;
  resumo: ConsolidadoFinanceiroCooperado["resumo"];
  descontosExtras: FichaCorridaDesconto[];
};

/** Única leitura de exibição financeira cooperado ↔ responsável (sem exceção por cooperado). */
export function leituraFinanceiraParidadeCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): LeituraFinanceiraParidadeCooperado {
  const consolidado = getConsolidadoFinanceiroCooperado(data, cooperadoId, cooperativaId);
  const mesesResumo = listarMesesReferenciaResumoFinanceiroParidade(
    data,
    cooperadoId,
    cooperativaId
  );
  const mesesHb =
    mesesResumo.length > 0 ? mesesResumo : consolidado.meses.length > 0 ? consolidado.meses : [];
  const descontosExtras = mesesHb.length
    ? getDescontosExtrasExibicaoCooperadoFinanceiro(data, cooperadoId, cooperativaId, mesesHb)
    : [];
  return {
    consolidado,
    mesesResumo: mesesHb,
    valorLiquido: consolidado.valorLiquido,
    mesLabel: consolidado.mesLabel,
    resumo: consolidado.resumo,
    descontosExtras,
  };
}
