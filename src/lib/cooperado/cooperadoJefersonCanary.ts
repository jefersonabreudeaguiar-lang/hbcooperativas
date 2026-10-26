import type { AppData } from "@/types";
import { COOPERADO_MOBILE_PILOT_COOPERADO_ID } from "@/lib/cooperado/cooperadoMobilePilot";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";

/** Revisão canário «A receber complementar pós-PIX» — alinhar a `COOPERADO_MOBILE_PILOT_PENDING_REVISION` ao promover. */
export const COOPERADO_JEFERSON_CANARY_FINANCE_COMPLEMENTAR_REVISION = 11;

export function cooperadoIdMatchesJefersonPilot(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  if (cooperadoId === COOPERADO_MOBILE_PILOT_COOPERADO_ID) return true;
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return canon === COOPERADO_MOBILE_PILOT_COOPERADO_ID;
}

/**
 * Financeiro complementar (escopo PIX explícito + dataConferencia) — só Jeferson até SIM e promoção GA.
 */
export function cooperadoJefersonCanaryFinanceComplementarAtivo(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  return cooperadoIdMatchesJefersonPilot(data, cooperadoId, cooperativaId);
}
