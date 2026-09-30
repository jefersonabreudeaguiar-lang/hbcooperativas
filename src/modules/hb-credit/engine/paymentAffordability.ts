import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

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

/** QR: aceita se pagar só com crédito ou crédito + cashback (toggle na confirmação). */
export function canAffordHbPaymentScanPreview(limite: ContaCoopLimiteCooperado, grossCents: number): boolean {
  return (
    canAffordHbPaymentWithLimite(limite, grossCents, false) ||
    canAffordHbPaymentWithLimite(limite, grossCents, true)
  );
}
