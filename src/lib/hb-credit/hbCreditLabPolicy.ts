import { isBicLabEnabledClient } from "@/lib/lab/bicLabGate";

/** Liberação padrão HB Créditos no LAB (responsável → cooperados). */
export const HB_CREDIT_LAB_LIBERACAO_PERCENT_DEFAULT = 70;

const STORAGE_VERSION = 1;

export function hbCreditLabLiberacaoStorageKey(cnpj: string): string {
  return `hb.coop.hbCreditLabLiberacao.v${STORAGE_VERSION}:${cnpj}`;
}

/** Somente app LAB (BIC) — não altera produção oficial. */
export function isHbCreditLabLiberacaoAutoEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return isBicLabEnabledClient();
}

/** UI HB cooperado — modelo único (oficial) em LAB e produção. */
export function isHbCreditoCooperadoInicioUiOficial(): boolean {
  return true;
}
