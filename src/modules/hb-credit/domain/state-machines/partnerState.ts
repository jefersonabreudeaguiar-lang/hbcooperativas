import type { HbCreditPartnerStatus } from "../entities";
import { HbCreditStateTransitionError } from "../../shared/errors";

const ALLOWED: Record<HbCreditPartnerStatus, HbCreditPartnerStatus[]> = {
  PENDING: ["ACTIVE", "BLOCKED"],
  ACTIVE: ["BLOCKED"],
  BLOCKED: ["ACTIVE"],
};

export function canTransitionPartner(from: HbCreditPartnerStatus, to: HbCreditPartnerStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertPartnerTransition(from: HbCreditPartnerStatus, to: HbCreditPartnerStatus): void {
  if (!canTransitionPartner(from, to)) {
    throw new HbCreditStateTransitionError(from, to, "Partner");
  }
}

/** PENDING não opera cobranças; ACTIVE elegível; BLOCKED não opera. */
export function partnerCanCreateCharges(status: HbCreditPartnerStatus): boolean {
  return status === "ACTIVE";
}

export function partnerCanOperate(status: HbCreditPartnerStatus): boolean {
  return status === "ACTIVE";
}
