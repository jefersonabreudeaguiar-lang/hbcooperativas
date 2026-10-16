/**
 * BIC como fonte única de exibição cooperado (padrão produção).
 * Mobile: snapshots materializados a partir de cooperadoLeituraFinanceiraExibicao → BIC.
 */
import type { User } from "@/types";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { isCooperadoFinanceiroAppDataLiveRead } from "@/lib/cooperado/cooperadoFinanceiroAppDataLiveRead";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";

/** BIC oficial ativo e modo AppData-live desligado — leitura padrão do app. */
export function isCooperadoBicExibicaoPadraoAtiva(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isBicCentralReadAuthorityEnabled(env) && !isCooperadoFinanceiroAppDataLiveRead(env);
}

/** Cooperado mobile — UI financeira só projeta via BIC (snapshots = cache da BIC). */
export function isCooperadoMobileBicLeituraAuthority(
  user: Omit<User, "password"> | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!user || user.role !== "cooperado") return false;
  return isCooperadoMobileGaPromoted(user) && isCooperadoBicExibicaoPadraoAtiva(env);
}
