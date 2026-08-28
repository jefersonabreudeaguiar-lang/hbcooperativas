import type { HbCreditLedgerEntry } from "../../domain/entities";
import type { LedgerDirection } from "../../domain/entities";
import type { MoneyCents } from "../../shared/money";

export interface AppendLedgerEntryInput {
  cooperativeCnpj: string;
  accountId: string;
  transactionId: string;
  entryType: string;
  amountCents: MoneyCents;
  direction: LedgerDirection;
  balanceReferenceCents?: MoneyCents;
  metadata?: Record<string, unknown>;
}

/** Append-only — correções geram novo evento, nunca UPDATE/DELETE. */
export interface LedgerService {
  append(input: AppendLedgerEntryInput): Promise<HbCreditLedgerEntry>;
  listByAccount(accountId: string, cooperativeCnpj: string, limit?: number): Promise<HbCreditLedgerEntry[]>;
}
