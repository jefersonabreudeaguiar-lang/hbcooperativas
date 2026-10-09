import type { AppData, LivroCaixaLancamento } from "@/types";
import { round2 } from "@/utils/calculations";
import { compareLancamentoSequencia, lancamentosLivroCaixa } from "@/services/livroCaixaService";

export interface LivroCaixaPlanilhaLinha {
  lancamento: LivroCaixaLancamento;
  credito: number | null;
  debito: number | null;
  saldoCorrido: number;
}

export function ordenarLancamentosPlanilha(lancamentos: LivroCaixaLancamento[]): LivroCaixaLancamento[] {
  return [...lancamentos].sort((a, b) => {
    const byData = a.data.localeCompare(b.data);
    if (byData !== 0) return byData;
    return compareLancamentoSequencia(a, b);
  });
}

export function buildPlanilhaLinhas(
  lancamentos: LivroCaixaLancamento[],
  saldoInicial = 0
): LivroCaixaPlanilhaLinha[] {
  let saldo = round2(saldoInicial);
  const ordenados = ordenarLancamentosPlanilha(lancamentos);
  return ordenados.map((l) => {
    const credito = l.tipo === "credito" ? l.valor : null;
    const debito = l.tipo === "debito" ? l.valor : null;
    if (credito != null) saldo = round2(saldo + credito);
    if (debito != null) saldo = round2(saldo - debito);
    return { lancamento: l, credito, debito, saldoCorrido: saldo };
  });
}

/** Saldo acumulado antes do primeiro lançamento do mês (YYYY-MM). */
export function saldoLivroCaixaAntesMes(data: AppData, cooperativaId: string, mesReferencia: string): number {
  const primeiroDia = `${mesReferencia}-01`;
  const anteriores = ordenarLancamentosPlanilha(
    lancamentosLivroCaixa(data, cooperativaId).filter((l) => l.data < primeiroDia)
  );
  const linhas = buildPlanilhaLinhas(anteriores);
  return linhas.length ? linhas[linhas.length - 1].saldoCorrido : 0;
}

export function lancamentosLivroCaixaPeriodo(
  data: AppData,
  cooperativaId: string,
  dataDe: string,
  dataAte: string
): LivroCaixaLancamento[] {
  return ordenarLancamentosPlanilha(
    lancamentosLivroCaixa(data, cooperativaId).filter((l) => l.data >= dataDe && l.data <= dataAte)
  );
}

export function saldoLivroCaixaAntesData(data: AppData, cooperativaId: string, dataIso: string): number {
  const anteriores = lancamentosLivroCaixa(data, cooperativaId).filter((l) => l.data < dataIso);
  const linhas = buildPlanilhaLinhas(anteriores);
  return linhas.length ? linhas[linhas.length - 1].saldoCorrido : 0;
}
