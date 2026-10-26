/**
 * Totais «a pagar» / Em aberto — mesma fonte que Pagar e Conferir (sem import circular).
 */
import type { AppData } from "@/types";
import { getRelatorioLancamentosEmAbertoResponsavel } from "@/services/responsavelPainelIndex";
import { getTotalValoresAPagarGestaoCooperativa } from "@/lib/responsavel/responsavelGestaoLeitura";
import { round2 } from "@/utils/calculations";

/** Soma das linhas do relatório Em aberto (paridade com Pagar / Início). */
export function totalValoresAPagarGestaoUnificado(data: AppData, cooperativaId: string): number {
  const linhas = getRelatorioLancamentosEmAbertoResponsavel(data, cooperativaId);
  const total = round2(linhas.reduce((s, l) => s + (l.total ?? 0), 0));
  if (total > 0.005) return total;
  return getTotalValoresAPagarGestaoCooperativa(
    data,
    cooperativaId
  );
}
