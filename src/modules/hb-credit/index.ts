/**
 * HB Credit Engine — ponto de entrada do domínio (Fase 0).
 * Exporta fundação; não registra rotas nem UI.
 */
export {
  isHbCreditEnabledServer,
  isHbCreditEnabledClient,
  isHbCreditUiAllowed,
  assertHbCreditEnabledServer,
  HB_CREDIT_FOUNDATION_VERSION,
} from "./shared/config";

export * from "./shared/money";
export * from "./shared/errors";
export * from "./domain/entities";
export * from "./domain/state-machines/paymentIntentState";
export * from "./domain/state-machines/partnerState";
export * from "./domain/state-machines/receivableState";
export * from "./domain/policies/partnerPolicy";
export * from "./application/CreditSourceProvider";
export * from "./security/cooperativeIsolation";
export * from "./audit/actions";
