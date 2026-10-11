/**
 * Ponte Início ↔ Financeiro — card “A receber” usa a mesma paridade/resumo do Financeiro
 * (HB compras, descontos e avulsos já líquidos no resumo). Sem gate BIC de ficha por id cru.
 */
import type { AppData } from "@/types";
import { cooperadoUsarFluxoReciboAssinaturaNaUi } from "@/lib/bic/cooperadoBicCentralUi";
import { cooperadoInicioParaCardsDefinitivos } from "@/lib/cooperadoApresentacaoFinanceira";
import {
  leituraFinanceiraParidadeCooperado,
  type LeituraFinanceiraParidadeCooperado,
} from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import {
  cooperadoMotorRevisionOperacional,
  sanitizeInicioCardSnapshotFluxoBic,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import { getValorQuantoVouReceberMotorLegado } from "@/services/cooperadoEntregasService";
import { bicCentralResolveInicioParaExibicao } from "@/services/bicLeituraCentralCooperado";
import { getCurrentMesReferencia } from "@/utils/format";

export function inicioCardMotorFromParidadeFinanceiro(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  paridade?: LeituraFinanceiraParidadeCooperado
): InicioCardMotorSnapshot {
  const p = paridade ?? leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const fluxoPix = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const modoRecibo =
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    fluxoPix.aguardandoAssinatura &&
    fluxoPix.valorRecibo > 0 &&
    p.valorLiquido <= 0;
  const valor = modoRecibo ? 0 : p.valorLiquido > 0 ? p.valorLiquido : 0;
  return sanitizeInicioCardSnapshotFluxoBic({
    mesLabel: p.mesLabel?.trim() || "—",
    valor,
    valorRecibo: modoRecibo ? fluxoPix.valorRecibo : 0,
    aguardandoAssinatura: modoRecibo,
  });
}

export function resolverMotorCardInicioParidadeFinanceiro(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): { motor: InicioCardMotorSnapshot; revision: string } {
  const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const motor = inicioCardMotorFromParidadeFinanceiro(data, cooperadoId, cooperativaId, paridade);
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);
  return { motor, revision };
}

/** Mesmo shape do painel Início PWA — fonte = paridade Financeiro. */
export function inicioValorReceberViewFromParidadeFinanceiro(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  apresentacaoConsolidada: boolean
): ReturnType<typeof bicCentralResolveInicioParaExibicao> {
  const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const fluxoPix = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const meses = paridade.mesesResumo.length > 0 ? paridade.mesesResumo : paridade.consolidado.meses;
  const mes = meses[0] ?? getCurrentMesReferencia();
  const valor = paridade.valorLiquido > 0 ? paridade.valorLiquido : 0;
  const modoRecibo =
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    fluxoPix.aguardandoAssinatura &&
    fluxoPix.valorRecibo > 0 &&
    valor <= 0;
  if (valor > 0 || modoRecibo) {
    return cooperadoInicioParaCardsDefinitivos(
      {
        exibir: true,
        mes,
        meses: meses.length ? [...meses] : [mes],
        mesLabel: paridade.mesLabel,
        valor,
        valorRecibo: modoRecibo ? fluxoPix.valorRecibo : 0,
        aguardandoAssinatura: Boolean(modoRecibo),
      },
      apresentacaoConsolidada
    );
  }
  return cooperadoInicioParaCardsDefinitivos(
    {
      exibir: false,
      mes,
      meses: meses.length ? [...meses] : [mes],
      mesLabel: paridade.mesLabel,
      valor: 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    },
    apresentacaoConsolidada
  );
}
