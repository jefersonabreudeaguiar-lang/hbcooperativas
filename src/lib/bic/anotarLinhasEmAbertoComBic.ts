import type { AppData } from "@/types";
import { staffCooperadoLeituraFinanceiraExibicao } from "@/lib/bic/bicStaffLeituraCooperado";
import type { LinhaPagarCooperadoEmAberto } from "@/services/relatorioService";
import { formatMesesReferenciaRotulo } from "@/utils/format";

/**
 * BIC anota o R$ da linha. A lista (quem está em aberto) continua operacional.
 */
export function anotarLinhasEmAbertoComBic(
  data: AppData,
  linhas: LinhaPagarCooperadoEmAberto[],
  coopId: string
): LinhaPagarCooperadoEmAberto[] {
  if (!coopId || linhas.length === 0) return linhas;
  return linhas.map((linha) => {
    const bic = staffCooperadoLeituraFinanceiraExibicao(data, linha.cooperadoId, coopId);
    if (!(bic.valorLiquido > 0.005)) return linha;
    const total = bic.valorLiquido;
    const meses = bic.mesesResumo.length > 0 ? bic.mesesResumo : linha.meses;
    const mesesLabel = bic.mesLabel?.trim() ? bic.mesLabel : formatMesesReferenciaRotulo(meses);
    const porMes =
      linha.porMes.length === 1
        ? [{ ...linha.porMes[0]!, total }]
        : linha.porMes;
    return { ...linha, total, meses, mesesLabel, porMes };
  });
}
