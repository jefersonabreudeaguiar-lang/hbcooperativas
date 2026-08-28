import { partnerCanCreateCharges, partnerCanOperate } from "../state-machines/partnerState";
import type { HbCreditPartnerStatus } from "../entities";

export function assertPartnerEligibleForCharges(status: HbCreditPartnerStatus): void {
  if (!partnerCanCreateCharges(status)) {
    throw new Error(
      status === "PENDING"
        ? "Parceiro pendente de aprovação — não pode operar."
        : "Parceiro bloqueado — não pode criar cobranças."
    );
  }
}

export function assertPartnerCanOperate(status: HbCreditPartnerStatus): void {
  if (!partnerCanOperate(status)) {
    throw new Error("Parceiro não autorizado a operar.");
  }
}
