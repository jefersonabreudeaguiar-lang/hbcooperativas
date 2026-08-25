/**
 * HB Credit Engine — barreira de laboratório.
 * Padrão: DESATIVADO. Produção oficial permanece sem lab.
 */

const LAB_FLAG = "HB_CREDIT_LAB_ENABLED";
const PUBLIC_LAB_FLAG = "NEXT_PUBLIC_HB_CREDIT_LAB_ENABLED";

/** Verdadeiro somente quando HB_CREDIT_LAB_ENABLED=true (server). */
export function isHbCreditLabEnabledServer(): boolean {
  return process.env[LAB_FLAG] === "true";
}

/** UI: exige flag pública explícita (evita ativar só no client). */
export function isHbCreditLabEnabledClient(): boolean {
  if (typeof window === "undefined") return false;
  return process.env[PUBLIC_LAB_FLAG] === "true";
}

export const LAB_NAMESPACE = "LAB_ONLY";
export const LAB_QR_SCHEME = "hb-credit-lab";

export function assertLabEnabledServer(): void {
  if (!isHbCreditLabEnabledServer()) {
    throw new LabDisabledError();
  }
}

export class LabDisabledError extends Error {
  constructor(message = "Laboratório HB Credit desativado.") {
    super(message);
    this.name = "LabDisabledError";
  }
}

export function isLabId(id: string): boolean {
  return id.startsWith(`${LAB_NAMESPACE}_`) || id.includes("_lab_");
}
