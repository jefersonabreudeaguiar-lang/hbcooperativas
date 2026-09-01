/**
 * Compatibilidade operacional — reexporta config fail-closed da fundação.
 */
export {
  assertHbCreditEnabledServer,
  assertHbCreditOperationsEnabled,
  isHbCreditEnabledClient,
  isHbCreditEnabledServer,
  isHbCreditOperationsEnabled,
  isHbCreditUiAllowed,
  HB_CREDIT_MODULE_ID,
  HB_CREDIT_FOUNDATION_VERSION,
  HbCreditDisabledError,
  HbCreditDisabledError as CreditDisabledError,
} from "./shared/config";

export const CREDIT_QR_SCHEME = "hb-credit";

/** Minutos até expirar cobrança */
export const INTENT_EXPIRY_MINUTES = 15;

/** PIN financeiro — mínimo de dígitos (primeira versão) */
export const FINANCIAL_PIN_MIN_LENGTH = 4;

/** Valor máximo de cobrança (centavos) — R$ 100.000,00 */
export const INTENT_MAX_CENTS = 10_000_000;
