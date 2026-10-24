/**
 * Estratégia líder — um valor “A receber” em todo o app cooperado mobile.
 *
 * - Fonte: `cooperadoLeituraFinanceiraExibicao` (BIC) com AppData ao vivo.
 * - Snapshot/localStorage: só 1º frame e offline; nunca vence o motor quando AppData está warm.
 * - Início e Financeiro usam o mesmo motor (paridade).
 */
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";

export const COOPERADO_EXIBICAO_FINANCEIRA_UNIFICADA_VERSION = 1;

/** Produção: paridade ao vivo para todos os cooperados GA no celular. */
export const COOPERADO_EXIBICAO_FINANCEIRA_UNIFICADA_AO_VIVO = true;

export function cooperadoExibicaoFinanceiraUnificadaAoVivo(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!COOPERADO_EXIBICAO_FINANCEIRA_UNIFICADA_AO_VIVO) return false;
  if (!user || user.role !== "cooperado") return false;
  return isCooperadoMobileGaPromoted(user);
}
