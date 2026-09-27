/**
 * BIC B1.2 — projeção financeira cooperado (READ-ONLY).
 * Delega aos motores existentes (B1.1); não persiste nem redefine regras.
 */
import type { AppData } from "@/types";
import {
  cooperadoExibirValorReceberInicio,
  getResumoQuantoVouReceberCooperado,
  getValorQuantoVouReceber,
  type EstadoQuantoVouReceberCooperado,
} from "@/services/cooperadoEntregasService";

export type { EstadoQuantoVouReceberCooperado };

export type BicProjecaoFinanceiraCooperadoOpts = {
  carregandoNuvem?: boolean;
  financeiroSincronizando?: boolean;
};

export type BicProjecaoFinanceiraCooperado = {
  /** Motor M6 — base numérica. */
  quantoVouReceber: ReturnType<typeof getValorQuantoVouReceber>;
  /** Motor M8 — cards do Início (`exibir`, recibo, aguardando). */
  inicio: ReturnType<typeof cooperadoExibirValorReceberInicio>;
  /** Motor M7 — painel Quanto vou receber (textos + carregamento). */
  painelQuantoVouReceber: ReturnType<typeof getResumoQuantoVouReceberCooperado>;
};

/**
 * Fachada BIC B1.2: centraliza leitura cooperado sem nova regra financeira.
 */
export function getProjecaoFinanceiraCooperadoBIC(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicProjecaoFinanceiraCooperadoOpts
): BicProjecaoFinanceiraCooperado {
  const quantoVouReceber = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  const inicio = cooperadoExibirValorReceberInicio(data, cooperadoId, cooperativaId);
  const painelQuantoVouReceber = getResumoQuantoVouReceberCooperado(
    data,
    cooperadoId,
    cooperativaId,
    opts
  );
  return { quantoVouReceber, inicio, painelQuantoVouReceber };
}
