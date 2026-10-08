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
import {
  getDescontosExtrasExibicaoCooperadoFinanceiro,
  getResumoPagamentoConsolidadoCooperado,
  getResumoPagamentoExibicao,
  getResumoPagamentoParaRegistro,
  resumoComplementaresPosPagamento,
  valorLiquidoFromResumoPartes,
} from "@/services/notaPedidoService";
import { formatMesesReferenciaRotulo } from "@/utils/format";

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
  const mesesResumo = listarMesesReferenciaResumoFinanceiroParidade(
    data,
    cooperadoId,
    cooperativaId
  );
  const consolidado = getConsolidadoFinanceiroCooperado(data, cooperadoId, cooperativaId);
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const mesesConsolidadoKey = [...consolidado.meses].sort().join("|");
  const mesesResumoKey = [...mesesResumo].sort().join("|");

  let resumo = consolidado.resumo;
  let valorLiquido = consolidado.valorLiquido;
  let mesLabel = consolidado.mesLabel;
  let aguardandoAssinatura = consolidado.aguardandoAssinatura;

  if (mesesResumo.length > 0 && mesesConsolidadoKey !== mesesResumoKey) {
    if (mesesResumo.length > 1) {
      resumo = getResumoPagamentoConsolidadoCooperado(data, cooperadoId, mesesResumo, coopId);
    } else {
      resumo =
        resumoComplementaresPosPagamento(data, cooperadoId, mesesResumo[0]!, coopId) ??
        getResumoPagamentoExibicao(data, cooperadoId, mesesResumo[0]!, coopId);
    }
    valorLiquido = valorLiquidoFromResumoPartes(resumo.valorEntregas, resumo.descontosExtras);
    resumo = { ...resumo, valorLiquido };
    mesLabel = formatMesesReferenciaRotulo(mesesResumo);
    aguardandoAssinatura = false;
  }

  const mesesHb =
    mesesResumo.length > 0 ? mesesResumo : consolidado.meses.length > 0 ? consolidado.meses : [];
  const descontosExtras = mesesHb.length
    ? getDescontosExtrasExibicaoCooperadoFinanceiro(data, cooperadoId, cooperativaId, mesesHb)
    : [];
  return {
    consolidado: {
      ...consolidado,
      meses: mesesHb,
      mesLabel,
      valorLiquido,
      resumo,
      aguardandoAssinatura,
    },
    mesesResumo: mesesHb,
    valorLiquido,
    mesLabel,
    resumo,
    descontosExtras,
  };
}

/** Mesma leitura do responsável na ficha filtrada por um mês (aba Entregas do cooperado). */
export function leituraFinanceiraParidadeCooperadoMesReferencia(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  mesReferencia: string
): Pick<LeituraFinanceiraParidadeCooperado, "resumo" | "descontosExtras" | "valorLiquido"> {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const descontosExtras = getDescontosExtrasExibicaoCooperadoFinanceiro(
    data,
    cooperadoId,
    cooperativaId,
    [mesReferencia]
  );
  const base = getResumoPagamentoExibicao(data, cooperadoId, mesReferencia, coopId);
  const resumo = getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, coopId);
  return {
    resumo,
    descontosExtras,
    valorLiquido: resumo.valorLiquido,
  };
}
