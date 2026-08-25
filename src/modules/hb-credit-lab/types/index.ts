/** Tipos do HB Credit Engine — laboratório isolado (LAB_ONLY). */

export type LabMoneyCents = number;

export type LabPaymentIntentStatus =
  | "pending"
  | "authorized"
  | "expired"
  | "cancelled"
  | "consumed";

export interface LabCreditAccount {
  id: string;
  cooperadoLabId: string;
  cooperadoNome: string;
  saldoDisponivelCents: LabMoneyCents;
  saldoReservadoCents: LabMoneyCents;
  updatedAt: string;
}

export interface LabMarket {
  id: string;
  nome: string;
  cnpjLab: string;
}

export interface LabPaymentIntent {
  id: string;
  marketId: string;
  marketNome: string;
  cooperadoLabId: string;
  amountCents: LabMoneyCents;
  descricao?: string;
  status: LabPaymentIntentStatus;
  nonce: string;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
  idempotencyKey: string;
}

export interface LabPaymentAuthorization {
  id: string;
  intentId: string;
  cooperadoLabId: string;
  amountCents: LabMoneyCents;
  saldoAntesCents: LabMoneyCents;
  saldoDepoisCents: LabMoneyCents;
  authorizedAt: string;
  expiresAt: string;
  idempotencyKey: string;
}

export interface LabLedgerEntry {
  id: string;
  accountId: string;
  type: "credit" | "debit" | "reserve" | "release" | "refund" | "adjustment";
  amountCents: LabMoneyCents;
  balanceAfterCents: LabMoneyCents;
  referenceType: "payment" | "seed" | "refund" | "adjustment";
  referenceId: string;
  memo: string;
  createdAt: string;
}

export interface LabMarketReceivable {
  id: string;
  marketId: string;
  authorizationId: string;
  amountCents: LabMoneyCents;
  status: "pending_settlement" | "settled";
  createdAt: string;
}

export interface LabCreditTransaction {
  id: string;
  authorizationId: string;
  intentId: string;
  marketId: string;
  cooperadoLabId: string;
  amountCents: LabMoneyCents;
  status: "completed" | "failed";
  receiptCode: string;
  createdAt: string;
}

export interface LabActivityItem {
  id: string;
  titulo: string;
  subtitulo: string;
  amountCents: LabMoneyCents;
  tipo: "debito" | "credito";
  createdAt: string;
}
