import type { HbCreditReceivableStatus } from "../entities";
import { HbCreditStateTransitionError } from "../../shared/errors";

const ALLOWED: Record<HbCreditReceivableStatus, HbCreditReceivableStatus[]> = {
  OPEN: ["ELIGIBLE", "BLOCKED_FOR_REVIEW"],
  ELIGIBLE: ["PROCESSING", "BLOCKED_FOR_REVIEW"],
  PROCESSING: ["SETTLED", "BLOCKED_FOR_REVIEW"],
  SETTLED: [],
  BLOCKED_FOR_REVIEW: ["OPEN", "ELIGIBLE"],
};

export function canTransitionReceivable(from: HbCreditReceivableStatus, to: HbCreditReceivableStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertReceivableTransition(from: HbCreditReceivableStatus, to: HbCreditReceivableStatus): void {
  if (!canTransitionReceivable(from, to)) {
    throw new HbCreditStateTransitionError(from, to, "Receivable");
  }
}
