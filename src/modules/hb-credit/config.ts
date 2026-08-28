/**
 * HB Credit Engine / Conta Coop — produção.
 * Padrão: DESATIVADO até homologação. Não altera Ficha Corrida.
 */

const CREDIT_FLAG = "HB_CREDIT_ENABLED";
const PUBLIC_CREDIT_FLAG = "NEXT_PUBLIC_HB_CREDIT_ENABLED";

export function isHbCreditEnabledServer(): boolean {
  return process.env[CREDIT_FLAG] === "true";
}

export function isHbCreditEnabledClient(): boolean {
  if (typeof window === "undefined") return false;
  return process.env[PUBLIC_CREDIT_FLAG] === "true";
}

export const CREDIT_QR_SCHEME = "hb-credit";

export function assertHbCreditEnabledServer(): void {
  if (!isHbCreditEnabledServer()) {
    throw new CreditDisabledError();
  }
}

export class CreditDisabledError extends Error {
  constructor(message = "Conta Coop desativada.") {
    super(message);
    this.name = "CreditDisabledError";
  }
}

/** Minutos até expirar cobrança */
export const INTENT_EXPIRY_MINUTES = 15;

/** PIN financeiro — mínimo de dígitos (primeira versão) */
export const FINANCIAL_PIN_MIN_LENGTH = 4;
