/**
 * Totais «a pagar» / Em aberto — mesma fonte que Pagar e Conferir (sem import circular).
 */
import type { AppData } from "@/types";
import {
  appDataParaPagarCooperadosResponsavel,
  getRelatorioLancamentosEmAbertoResponsavel,
} from "@/services/responsavelPainelIndex";
import { getTotalValoresAPagarGestaoCooperativa } from "@/lib/responsavel/responsavelGestaoLeitura";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";

function cooperadosAtivosCadastrados(data: AppData, cooperativaId: string) {
  return data.cooperados.filter((c) => c.cooperativaId === cooperativaId && c.status === "ativo");
}

/** SSOT: soma `getTotalAPagarCooperado` (getResumoValorAPagarRelatorio). Em aberto só entra se bater. */
export function totalValoresAPagarGestaoUnificado(data: AppData, cooperativaId: string): number {
  const dataPagar = appDataParaPagarCooperadosResponsavel(data, cooperativaId);
  const cooperados = cooperadosAtivosCadastrados(dataPagar, cooperativaId);
  const totalOficial = round2(
    cooperados.reduce(
      (s, c) => s + getTotalAPagarCooperado(dataPagar, c.id, undefined, cooperativaId),
      0
    )
  );
  if (totalOficial > 0.005) return totalOficial;
  const linhas = getRelatorioLancamentosEmAbertoResponsavel(dataPagar, cooperativaId);
  const totalLinhas = round2(linhas.reduce((s, l) => s + (l.total ?? 0), 0));
  if (totalLinhas > 0.005) return totalLinhas;
  return getTotalValoresAPagarGestaoCooperativa(dataPagar, cooperativaId);
}
