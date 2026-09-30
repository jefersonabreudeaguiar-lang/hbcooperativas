export interface CreditAccountRow {
  accountId: string;
  cooperadoId: string;
  limitCents: number;
  usedCents: number;
  availableCents: number;
}

export interface CreditObservation {
  cooperativeCnpj: string;
  accountId: string;
  snapshotId: string;
  observedAt: string;
  limitCents: number;
  usedCents: number;
  availableCents: number;
}

export interface CreditFinding {
  accountId: string;
  eventType: string;
  expectedCents: number | null;
  observedCents: number | null;
  differenceCents: number | null;
}
