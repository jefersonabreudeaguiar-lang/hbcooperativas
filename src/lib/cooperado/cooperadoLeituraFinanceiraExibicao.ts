/**
 * Entrada única de leitura financeira cooperado (Início, Financeiro, PWA snapshots).
 * Concerto BIC — delega ao hub `bicLeituraPorta` quando a superfície cooperado está ativa.
 */
import type { AppData } from "@/types";
import { isBicLeituraPortaAtiva } from "@/lib/bic/bicLeituraPortaGating";
import {
  leituraCooperadoFinanceira,
  resolveLeituraFinanceiraCooperadoCore,
  type BicLeituraPortaCooperadoOpts,
} from "@/lib/bic/bicLeituraPorta";
import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import type { BicCentralProjecaoOpts } from "@/services/bicLeituraCentralCooperado";

export function cooperadoLeituraFinanceiraExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): LeituraFinanceiraParidadeCooperado {
  const portaOpts: BicLeituraPortaCooperadoOpts | undefined = opts;
  if (isBicLeituraPortaAtiva("cooperado")) {
    return leituraCooperadoFinanceira(data, cooperadoId, cooperativaId, portaOpts).value;
  }
  return resolveLeituraFinanceiraCooperadoCore(data, cooperadoId, cooperativaId, portaOpts);
}
