/**
 * Entrada única de leitura financeira cooperado (Início, Financeiro, PWA snapshots).
 * APPDATA_LIVE: paridade direta no AppData. Caso contrário, BIC quando autoridade ativa.
 */
import type { AppData } from "@/types";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { isCooperadoFinanceiroAppDataLiveRead } from "@/lib/cooperado/cooperadoFinanceiroAppDataLiveRead";
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
  if (!isCooperadoFinanceiroAppDataLiveRead() && isBicCentralReadAuthorityEnabled()) {
    return bicCentralLeituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId, opts);
  }
  return leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
}
