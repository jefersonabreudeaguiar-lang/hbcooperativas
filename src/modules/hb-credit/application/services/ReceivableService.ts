import type { HbCreditReceivable } from "../../domain/entities";

export interface ReceivableService {
  listByPartner(partnerId: string, cooperativeCnpj: string): Promise<HbCreditReceivable[]>;
}
