import type { MoneyCents } from "../shared/money";

export type HbCreditAccountStatus = "active" | "blocked" | "suspended";

export type HbCreditPartnerStatus = "PENDING" | "ACTIVE" | "BLOCKED";

export type HbCreditPaymentIntentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZING"
  | "CONFIRMED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type HbCreditTransactionEventType =
  | "LIMIT_RELEASE"
  | "PAYMENT"
  | "REFUND"
  | "ADJUSTMENT"
  | "RESERVATION"
  | "RESERVATION_RELEASE";

export type HbCreditReceivableStatus =
  | "OPEN"
  | "ELIGIBLE"
  | "PROCESSING"
  | "SETTLED"
  | "BLOCKED_FOR_REVIEW";

export type LedgerDirection = "debit" | "credit";

export interface HbCreditAccount {
  id: string;
  cooperativeCnpj: string;
  cooperadoId: string;
  status: HbCreditAccountStatus;
  limitReleasedCents: MoneyCents;
  amountUsedCents: MoneyCents;
  availableCents: MoneyCents;
  currency: typeof import("../shared/money").DEFAULT_CURRENCY;
  createdAt: string;
  updatedAt: string;
}

export interface HbCreditCooperativeCap {
  cooperativeCnpj: string;
  globalCreditCapCents: MoneyCents;
  updatedAt: string;
}

export interface HbCreditPartner {
  id: string;
  cooperativeCnpj: string;
  partnerCnpj: string;
  name: string;
  email: string;
  status: HbCreditPartnerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HbCreditPaymentIntent {
  id: string;
  cooperativeCnpj: string;
  partnerId: string;
  cooperadoId?: string | null;
  amountCents: MoneyCents;
  currency: string;
  description?: string | null;
  status: HbCreditPaymentIntentStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
}

export interface HbCreditTransaction {
  id: string;
  cooperativeCnpj: string;
  accountId?: string | null;
  paymentIntentId?: string | null;
  partnerId?: string | null;
  cooperadoId?: string | null;
  eventType: HbCreditTransactionEventType;
  amountCents: MoneyCents;
  currency: string;
  status: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface HbCreditLedgerEntry {
  id: string;
  cooperativeCnpj: string;
  accountId: string;
  transactionId: string;
  entryType: string;
  amountCents: MoneyCents;
  direction: LedgerDirection;
  balanceReferenceCents?: MoneyCents | null;
  createdAt: string;
}

export interface HbCreditReceivable {
  id: string;
  cooperativeCnpj: string;
  partnerId: string;
  transactionId: string;
  amountCents: MoneyCents;
  status: HbCreditReceivableStatus;
  createdAt: string;
}

export interface HbCreditRefund {
  id: string;
  cooperativeCnpj: string;
  originalTransactionId: string;
  refundTransactionId: string;
  amountCents: MoneyCents;
  status: string;
  createdAt: string;
}

export interface HbCreditIdempotencyRecord {
  cooperativeCnpj: string;
  scope: string;
  idempotencyKey: string;
  resultReferenceId: string;
  createdAt: string;
}
