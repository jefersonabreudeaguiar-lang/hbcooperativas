/**
 * HB Credit Engine — feature flag central (fail-closed).
 * Padrão obrigatório: OFF. Ausência ou valor inválido = OFF.
 */

const SERVER_FLAG = "HB_CREDIT_ENABLED";
const CLIENT_FLAG = "NEXT_PUBLIC_HB_CREDIT_ENABLED";
const SERVER_LAB_FLAG = "HB_CREDIT_LAB_ENABLED";
const CLIENT_LAB_FLAG = "NEXT_PUBLIC_HB_CREDIT_LAB_ENABLED";

const ALLOWED_ON = new Set(["true", "1"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

function isDevLabServerEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && parseFlag(process.env[SERVER_LAB_FLAG]);
}

function isDevLabClientEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && parseFlag(process.env[CLIENT_LAB_FLAG]);
}

/** Servidor: autoridade para operações financeiras. */
export function isHbCreditEnabledServer(): boolean {
  return parseFlag(process.env[SERVER_FLAG]) || isDevLabServerEnabled();
}

/** Cliente: somente indica intenção de UI; nunca autoriza operação financeira. */
export function isHbCreditEnabledClient(): boolean {
  if (typeof window === "undefined") return false;
  return parseFlag(process.env[CLIENT_FLAG]) || isDevLabClientEnabled();
}

/**
 * UI habilitada = flag pública TRUE AND confirmação segura do servidor.
 * Fase 0: servidor sempre false em produção → UI nunca operacional.
 */
export function isHbCreditUiAllowed(serverConfirmed: boolean): boolean {
  return isHbCreditEnabledClient() && serverConfirmed === true;
}

export class HbCreditDisabledError extends Error {
  constructor(message = "HB Credit Engine desativado.") {
    super(message);
    this.name = "HbCreditDisabledError";
  }
}

export function assertHbCreditEnabledServer(): void {
  if (!isHbCreditEnabledServer()) {
    throw new HbCreditDisabledError();
  }
}

export const HB_CREDIT_MODULE_ID = "hb-credit-engine";
export const HB_CREDIT_FOUNDATION_VERSION = 0;
