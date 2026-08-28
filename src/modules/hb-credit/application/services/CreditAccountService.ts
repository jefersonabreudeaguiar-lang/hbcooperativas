import type { HbCreditAccount } from "../../domain/entities";
import type { MoneyCents } from "../../shared/money";

export interface CreditAccountService {
  getByCooperado(cooperativeCnpj: string, cooperadoId: string): Promise<HbCreditAccount | null>;
  /** Fase 0: contrato apenas — implementação futura com flag + autorização server-side. */
  ensureAccountExists(cooperativeCnpj: string, cooperadoId: string): Promise<HbCreditAccount>;
}

export interface CreditLimitService {
  previewLimitChange(
    cooperativeCnpj: string,
    cooperadoId: string,
    newLimitCents: MoneyCents
  ): Promise<{ ok: boolean; totalDistributedAfter: MoneyCents; capCents: MoneyCents }>;
  setLimit(
    cooperativeCnpj: string,
    cooperadoId: string,
    newLimitCents: MoneyCents,
    actorId: string
  ): Promise<HbCreditAccount>;
  setGlobalCap(cooperativeCnpj: string, capCents: MoneyCents, actorId: string): Promise<void>;
}
