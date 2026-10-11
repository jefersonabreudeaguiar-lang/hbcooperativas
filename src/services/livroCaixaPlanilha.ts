import type { AppData, LivroCaixaLancamento } from "@/types";
import { round2 } from "@/utils/calculations";
import { compareLancamentoSequencia, lancamentosLivroCaixa } from "@/services/livroCaixaService";

/** Linhas por página na planilha do livro caixa (tela do responsável). */
export const LIVRO_CAIXA_LINHAS_POR_PAGINA = 40;

export interface LivroCaixaPlanilhaLinha {
  lancamento: LivroCaixaLancamento;
  credito: number | null;
  debito: number | null;
  saldoCorrido: number;
}

/** Ordem cronológica (mais antigo → mais novo) para saldo corrido. */
export function ordenarLancamentosPlanilha(lancamentos: LivroCaixaLancamento[]): LivroCaixaLancamento[] {
  return [...lancamentos].sort((a, b) => {
    const byData = a.data.localeCompare(b.data);
    if (byData !== 0) return byData;
    return compareLancamentoSequencia(a, b);
  });
}

function buildPlanilhaLinhasCronologico(
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

/** Planilha na tela/relatório: lançamentos mais novos no topo; saldo corrido de cada linha permanece contábil. */
export function buildPlanilhaLinhas(
  lancamentos: LivroCaixaLancamento[],
  saldoInicial = 0
): LivroCaixaPlanilhaLinha[] {
  const cronologico = buildPlanilhaLinhasCronologico(lancamentos, saldoInicial);
  return [...cronologico].reverse();
}

/** Saldo após o último lançamento do período (independente da ordem de exibição). */
export function saldoCorridoFinalPlanilha(linhas: LivroCaixaPlanilhaLinha[], saldoInicial = 0): number {
  if (!linhas.length) return round2(saldoInicial);
  const cronologico = [...linhas].sort((a, b) => {
    const byData = a.lancamento.data.localeCompare(b.lancamento.data);
    if (byData !== 0) return byData;
    return compareLancamentoSequencia(a.lancamento, b.lancamento);
  });
  return cronologico[cronologico.length - 1].saldoCorrido;
}

/** Saldo acumulado antes do primeiro lançamento do mês (YYYY-MM). */
export function saldoLivroCaixaAntesMes(data: AppData, cooperativaId: string, mesReferencia: string): number {
  const primeiroDia = `${mesReferencia}-01`;
  const anteriores = ordenarLancamentosPlanilha(
    lancamentosLivroCaixa(data, cooperativaId).filter((l) => l.data < primeiroDia)
  );
  const linhas = buildPlanilhaLinhasCronologico(anteriores);
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
  const linhas = buildPlanilhaLinhasCronologico(anteriores);
  return linhas.length ? linhas[linhas.length - 1].saldoCorrido : 0;
}
