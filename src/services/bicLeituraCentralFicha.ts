/**
 * BIC LAB — leitura central ficha mensal (C1/C2) e exibição por mês.
 */
import type { AppData } from "@/types";
import { isBicLabFullIntegrationEnabled } from "@/lib/lab/bicLabFullIntegration";
import { validateBicTenantContext } from "@/services/bicTenantGuard";
import {
  buildValorExibicaoCooperadoOpts,
  getResumoPagamentoExibicao,
  getValorExibicaoCooperado,
  type ValorExibicaoCooperadoOpts,
} from "@/services/notaPedidoService";

function assertBicTenantCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): void {
  if (!isBicLabFullIntegrationEnabled()) return;
  const v = validateBicTenantContext(data, {
    cooperativaId: cooperativaId ?? "",
    cooperadoId,
  });
  if (v.status !== "valid") {
    throw new Error(`BIC LAB ficha: projeção bloqueada (${v.status})`);
  }
}

export function bicCentralBuildValorExibicaoCooperadoOpts(
  ...args: Parameters<typeof buildValorExibicaoCooperadoOpts>
): ReturnType<typeof buildValorExibicaoCooperadoOpts> {
  return buildValorExibicaoCooperadoOpts(...args);
}

export function bicCentralGetResumoPagamentoExibicao(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string,
  opts?: Parameters<typeof getResumoPagamentoExibicao>[4]
): ReturnType<typeof getResumoPagamentoExibicao> {
  assertBicTenantCooperado(data, cooperadoId, cooperativaId);
  return getResumoPagamentoExibicao(data, cooperadoId, mesReferencia, cooperativaId, opts);
}

export function bicCentralGetValorExibicaoCooperado(
  resumo: Parameters<typeof getValorExibicaoCooperado>[0],
  opts: ValorExibicaoCooperadoOpts
): ReturnType<typeof getValorExibicaoCooperado> {
  return getValorExibicaoCooperado(resumo, opts);
}
