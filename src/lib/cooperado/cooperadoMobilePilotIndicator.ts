import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";

/**
 * Ciclo piloto → GA (estrela no header do cooperado Jeferson):
 *
 * 1. Nova mudança só no piloto → subir `COOPERADO_MOBILE_PILOT_PENDING_REVISION`.
 * 2. Jeferson vê estrela amarela ao lado de «HB Cooperativas» enquanto PENDING > PROMOTED.
 * 3. Após testes OK e promoção para todos → igualar PROMOTED a PENDING (e remover ramos `if` piloto).
 * 4. Estrela some para o Jeferson; demais cooperados já estão no GA.
 * 5. Próximo ciclo: subir PENDING de novo.
 */

/** Revisão atual em teste (somente piloto Jeferson). */
export const COOPERADO_MOBILE_PILOT_PENDING_REVISION = 1;

/** Última revisão já liberada para todos (GA). */
export const COOPERADO_MOBILE_PILOT_PROMOTED_REVISION = 0;

export function cooperadoMobilePilotHasUnpromotedChanges(): boolean {
  return COOPERADO_MOBILE_PILOT_PENDING_REVISION > COOPERADO_MOBILE_PILOT_PROMOTED_REVISION;
}

/** Estrela amarela — só cooperado Jeferson, com mudanças piloto ainda não promovidas. */
export function cooperadoMobilePilotShowHeaderStar(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  if (!isCooperadoMobilePilot(user)) return false;
  return cooperadoMobilePilotHasUnpromotedChanges();
}
