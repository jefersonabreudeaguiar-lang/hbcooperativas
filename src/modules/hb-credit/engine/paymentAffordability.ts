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
  const rawCap =
    financialLimitCapCents == null ? null : Number(financialLimitCapCents);
  /** Cap 0 com liberado > 0 é residual de ciclo antigo — não esconde o saldo nas compras. */
  const cap =
    rawCap == null || !Number.isFinite(rawCap) || (rawCap <= 0 && released > 0)
      ? released
      : Math.max(0, Math.round(rawCap));
  const effectiveLimit = Math.min(released, cap);
  const usado = Math.max(0, Math.round(amountUsedCents));
  return Math.max(0, effectiveLimit - usado);
}

/** Débito de crédito HB após aplicar cashback (espelha hb_credit_authorize_payment). */
export function hbCreditDebitFromGrossCents(grossCents: number, useCashback: boolean, cashbackAvailableCents: number, ownBalanceAvailableCents = 0): number {
  const gross = Math.max(0, Math.round(grossCents));
  const cb = useCashback ? Math.max(0, Math.round(cashbackAvailableCents)) : 0;
  const own = Math.max(0, Math.round(ownBalanceAvailableCents));
  return Math.max(0, gross - Math.min(cb, gross) - own);
}

/** Saldo próprio é recurso disponível, sem aumentar o limite de empréstimo. */
export function hbPaymentAvailableCents(limite: ContaCoopLimiteCooperado): number {
  if (limite.bloqueado) return 0;
  return Math.max(0, limite.valorDisponivelCents) + Math.max(0, limite.saldoProprioDisponivelCents ?? 0);
}

/** Limite alinhado (cap) — cooperado pode pagar este valor com a flag de cashback informada. */
export function canAffordHbPaymentWithLimite(
  limite: ContaCoopLimiteCooperado,
  grossCents: number,
  useCashback: boolean
): boolean {
  if (limite.bloqueado) return false;
  const cashback = limite.cashbackDisponivelCents ?? 0;
  const creditDebit = hbCreditDebitFromGrossCents(grossCents, useCashback, cashback, limite.saldoProprioDisponivelCents ?? 0);
  return limite.valorDisponivelCents >= creditDebit;
}

/** QR: crédito HB ou crédito + cashback (cashback não entra no saldo exibido; uso só na autorização). */
export function canAffordHbPaymentScanPreview(limite: ContaCoopLimiteCooperado, grossCents: number): boolean {
  return (
    canAffordHbPaymentWithLimite(limite, grossCents, false) ||
    canAffordHbPaymentWithLimite(limite, grossCents, true)
  );
}

/** Preserva o disponível informado pelo servidor, inclusive reduções por teto. */
export function normalizeHbPaymentLimiteDisponivel(
  limite: ContaCoopLimiteCooperado
): ContaCoopLimiteCooperado {
  const liberado = Math.max(0, limite.limiteLiberadoCents ?? 0);
  const usado = Math.max(0, limite.valorUsadoCents ?? 0);
  const informado = Math.max(0, limite.valorDisponivelCents ?? 0);
  const disponivel = limite.bloqueado ? 0 : Math.min(informado, Math.max(0, liberado - usado));
  return { ...limite, valorDisponivelCents: disponivel };
}

/** Escolhe uma leitura inteira da mesma conta. Nunca combina máximos de revisões diferentes. */
export function mergeHbPaymentLimiteForScan(
  qrLimite: ContaCoopLimiteCooperado,
  account?: ContaCoopLimiteCooperado | null
): ContaCoopLimiteCooperado {
  const fromQr = normalizeHbPaymentLimiteDisponivel(qrLimite);
  if (!account) return fromQr;
  if (account.cooperadoId !== qrLimite.cooperadoId || account.cooperativaCnpj !== qrLimite.cooperativaCnpj) return fromQr;
  const fromAcc = normalizeHbPaymentLimiteDisponivel(account);
  const qrTime = Date.parse(fromQr.updatedAt);
  const accountTime = Date.parse(fromAcc.updatedAt);
  return Number.isFinite(qrTime) && Number.isFinite(accountTime) && accountTime > qrTime ? fromAcc : fromQr;
}
