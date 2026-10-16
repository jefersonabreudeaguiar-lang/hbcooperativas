/**
 * Entrada única de leitura financeira cooperado (Início, Financeiro, PWA snapshots).
 * Com BIC oficial/LAB: orquestra via bicLeituraCentralCooperado.
 */
import type { AppData } from "@/types";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import {
  leituraFinanceiraParidadeCooperado,
  type LeituraFinanceiraParidadeCooperado,
} from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import {
  bicCentralLeituraFinanceiraParidadeCooperado,
  type BicCentralProjecaoOpts,
} from "@/services/bicLeituraCentralCooperado";

export function cooperadoLeituraFinanceiraExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): LeituraFinanceiraParidadeCooperado {
  if (isBicCentralReadAuthorityEnabled()) {
    return bicCentralLeituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId, opts);
  }
  return leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
}
