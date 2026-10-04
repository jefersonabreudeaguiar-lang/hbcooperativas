import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

export const HB_CREDIT_INSUFFICIENT_CODE = "HB_CREDIT_INSUFFICIENT";
export const HB_CREDIT_SALDO_INSUFICIENTE_MSG = "Saldo insuficiente.";

/** Espelha hb_credit_effective_disponivel_cents (cap × usado). */
export function hbCreditEffectiveDisponivelCents(
  limitReleasedCents: number,
  financialLimitCapCents: number | null | undefined,
  amountUsedCents: number
): number {
  const released = Math.max(0, Math.round(limitReleasedCents));
  const cap =
    financialLimitCapCents == null ? released : Math.max(0, Math.round(financialLimitCapCents));
  const effectiveLimit = Math.min(released, cap);
  const usado = Math.max(0, Math.round(amountUsedCents));
  return Math.max(0, effectiveLimit - usado);
}

/** Débito de crédito HB após aplicar cashback (espelha hb_credit_authorize_payment). */
export function hbCreditDebitFromGrossCents(grossCents: number, useCashback: boolean, cashbackAvailableCents: number): number {
  const gross = Math.max(0, Math.round(grossCents));
  if (!useCashback) return gross;
  const cb = Math.max(0, Math.round(cashbackAvailableCents));
  return Math.max(0, gross - Math.min(cb, gross));
}

/** Limite alinhado (cap) — cooperado pode pagar este valor com a flag de cashback informada. */
export function canAffordHbPaymentWithLimite(
  limite: ContaCoopLimiteCooperado,
  grossCents: number,
  useCashback: boolean
): boolean {
  const cashback = limite.cashbackDisponivelCents ?? 0;
  const creditDebit = hbCreditDebitFromGrossCents(grossCents, useCashback, cashback);
  return limite.valorDisponivelCents >= creditDebit;
}

/** QR: crédito HB ou crédito + cashback (cashback não entra no saldo exibido; uso só na autorização). */
export function canAffordHbPaymentScanPreview(limite: ContaCoopLimiteCooperado, grossCents: number): boolean {
  return (
    canAffordHbPaymentWithLimite(limite, grossCents, false) ||
    canAffordHbPaymentWithLimite(limite, grossCents, true)
  );
}
