export type ParceiroStatus = "pendente" | "ativo" | "bloqueado";

export type IntentStatus =
  | "criada"
  | "pendente"
  | "em_autorizacao"
  | "confirmada"
  | "expirada"
  | "cancelada"
  | "recusada"
  | "estorno_pendente"
  | "estornada";

export type RecebivelStatus =
  | "aberto"
  | "elegivel"
  | "em_processamento"
  | "liquidado"
  | "bloqueado_revisao"
  | "estornado";

export type LedgerTipo =
  | "LIMIT_RELEASE"
  | "LIMIT_ADJUST"
  | "PAYMENT"
  | "REFUND"
  | "PARTNER_APPROVE"
  | "PARTNER_BLOCK";

export interface ContaCoopTresValores {
  limiteLiberadoCents: number;
  valorUsadoCents: number;
  valorDisponivelCents: number;
}

export interface ContaCoopTetoResumo {
  /** Percentual máximo sobre o crédito total na ficha (0 = usa 100%). */
  tetoGlobalPercent: number;
  /** Valor em centavos equivalente ao percentual (crédito ficha × %). */
  tetoGlobalCents: number;
  creditoBaseTotalCents: number;
  limiteDistribuidoCents: number;
  restanteParaLiberarCents: number;
}

export interface ContaCoopParceiro {
  id: string;
  cooperativaCnpj: string;
  cnpjMercado: string;
  nomeMercado: string;
  email: string;
  status: ParceiroStatus;
  appUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContaCoopLimiteCooperado extends ContaCoopTresValores {
  id: string;
  cooperativaCnpj: string;
  cooperadoId: string;
  bloqueado: boolean;
  updatedAt: string;
}

export interface ContaCoopIntent {
  id: string;
  cooperativaCnpj: string;
  parceiroId: string;
  parceiroNome?: string;
  amountCents: number;
  descricao?: string;
  status: IntentStatus;
  nonce: string;
  expiresAt: string;
  createdAt: string;
}

export interface ContaCoopTransacao {
  id: string;
  intentId: string;
  cooperadoId: string;
  parceiroId: string;
  amountCents: number;
  status: string;
  receiptCode: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface ContaCoopLedgerEntry {
  id: string;
  tipo: LedgerTipo | string;
  amountCents: number;
  saldoDisponivelAposCents?: number | null;
  memo?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
}

export interface ContaCoopDashboard {
  teto: ContaCoopTetoResumo;
  agregadoCooperados: ContaCoopTresValores;
  parceirosPendentes: number;
  transacoesRecentes: number;
}
