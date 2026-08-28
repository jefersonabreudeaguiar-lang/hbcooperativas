import type { HbCreditPaymentIntentStatus } from "../entities";
import { HbCreditStateTransitionError } from "../../shared/errors";

const ALLOWED: Record<HbCreditPaymentIntentStatus, HbCreditPaymentIntentStatus[]> = {
  CREATED: ["PENDING", "CANCELLED", "EXPIRED"],
  PENDING: ["AUTHORIZING", "CANCELLED", "EXPIRED"],
  AUTHORIZING: ["CONFIRMED", "DECLINED"],
  CONFIRMED: ["REFUND_PENDING"],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

export function canTransitionPaymentIntent(
  from: HbCreditPaymentIntentStatus,
  to: HbCreditPaymentIntentStatus
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertPaymentIntentTransition(
  from: HbCreditPaymentIntentStatus,
  to: HbCreditPaymentIntentStatus
): void {
  if (!canTransitionPaymentIntent(from, to)) {
    throw new HbCreditStateTransitionError(from, to, "PaymentIntent");
  }
}

/** Proibido explicitamente: CONFIRMED → PENDING */
export function isForbiddenPaymentIntentTransition(
  from: HbCreditPaymentIntentStatus,
  to: HbCreditPaymentIntentStatus
): boolean {
  return from === "CONFIRMED" && (to === "PENDING" || to === "CREATED" || to === "AUTHORIZING");
}
