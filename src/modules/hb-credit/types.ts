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
  | "PARTNER_BLOCK"
  | "CASHBACK_EARN"
  | "CASHBACK_USE"
  | "CASHBACK_SWEEP";

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
  pixKey?: string | null;
  pixHolderName?: string | null;
  pixUpdatedAt?: string | null;
  appUserId?: string | null;
  /** Percentual de desconto contratual que o mercado concede nas compras (0–100). */
  partnerDiscountPercent?: number;
  partnerTermsVersion?: string | null;
  partnerTermsAcceptedAt?: string | null;
  partnerTermsAcceptedBy?: string | null;
  partnerTermsDiscountSnapshot?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContaCoopLimiteCooperado extends ContaCoopTresValores {
  id: string;
  cooperativaCnpj: string;
  cooperadoId: string;
  bloqueado: boolean;
  cashbackDisponivelCents?: number;
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

/** Compra confirmada que a equipe da cooperativa pode estornar. */
export interface ContaCoopCompraEstornavel {
  id: string;
  cooperadoId: string;
  parceiroId: string;
  parceiroNome: string;
  amountCents: number;
  receiptCode?: string | null;
  descricao?: string | null;
  recebivelStatus?: RecebivelStatus;
  createdAt: string;
  /** Solicitação pendente do mercado parceiro, se houver. */
  solicitacaoPendenteId?: string | null;
}

export type SolicitacaoEstornoStatus = "pendente" | "aprovado" | "negado" | "cancelado";

export interface ContaCoopSolicitacaoEstorno {
  id: string;
  transactionId: string;
  cooperadoId: string;
  parceiroId: string;
  parceiroNome: string;
  amountCents: number;
  motivo: string;
  status: SolicitacaoEstornoStatus;
  receiptCode?: string | null;
  descricao?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
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

export type SettlementStatus = "aguardando_mercado" | "confirmado" | "cancelado";

export interface ContaCoopSettlementTransacao {
  id: string;
  recebivelId: string;
  cooperadoId: string;
  tipo: "PAYMENT" | "REFUND";
  amountCents: number;
  receiptCode?: string | null;
  descricao?: string | null;
  createdAt: string;
}

export interface ContaCoopCooperadoLiquidacao {
  cooperadoId: string;
  totalComprasCents: number;
  totalEstornosCents: number;
  saldoCents: number;
  transacoes: ContaCoopSettlementTransacao[];
}

export interface ContaCoopLiquidacaoPreview {
  partnerId: string;
  partnerNome: string;
  mesReferencia: string;
  pixKey?: string | null;
  pixHolderName?: string | null;
  totalCents: number;
  transacoesCount: number;
  cooperados: ContaCoopCooperadoLiquidacao[];
  /** Resumo fiscal do mês — vendas × NFs conferidas. */
  fiscalResumo?: ContaCoopFiscalNotesResumo;
  pagamentoAprovado?: boolean;
  bloqueioPagamento?: string | null;
}

export type FiscalNoteStatus =
  | "pendente_anexo"
  | "aguardando_conferencia"
  | "conferida"
  | "correcao_pedida"
  | "cancelada";

export interface ContaCoopFiscalNote {
  id: string;
  transactionId: string;
  receivableId: string | null;
  partnerId: string;
  cooperadoId: string;
  cooperadoNome: string | null;
  mesReferencia: string;
  saleAmountCents: number;
  status: FiscalNoteStatus;
  photoStoragePath: string | null;
  nfNumber: string | null;
  nfIssuedToName: string | null;
  nfDate: string | null;
  nfAmountCents: number | null;
  rejectReason: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  receiptCode: string | null;
  descricao: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContaCoopFiscalNotesResumo {
  mesReferencia: string;
  partnerId?: string;
  totalVendasCents: number;
  totalConferidasCents: number;
  pendentesAnexo: number;
  aguardandoConferencia: number;
  correcaoPedida: number;
  conferidas: number;
  totalVendas: number;
}

export interface ContaCoopSettlement {
  id: string;
  partnerId: string;
  partnerNome: string;
  mesReferencia: string;
  totalCents: number;
  transacoesCount: number;
  status: SettlementStatus;
  responsavelNome?: string | null;
  pagoEm?: string | null;
  comprovanteMemo?: string | null;
  relatorioHtml?: string | null;
  partnerConfirmadoEm?: string | null;
  createdAt: string;
}

export interface ContaCoopDiscountPoolResumo {
  mesReferencia: string;
  totalGrossCents: number;
  totalDiscountCents: number;
  totalNetPartnerCents: number;
  totalCashbackCents: number;
  totalAppCents: number;
  totalCoopCents: number;
  appLiquidadoCents: number;
  coopLiquidadoCents: number;
  appPendenteCents: number;
  coopPendenteCents: number;
  transacoesCount: number;
}

export interface ContaCoopDiscountAllocation {
  id: string;
  transactionId: string;
  cooperadoId: string;
  partnerId: string;
  partnerNome?: string;
  mesReferencia: string;
  grossCents: number;
  discountCents: number;
  netPartnerCents: number;
  cashbackCents: number;
  appCents: number;
  coopCents: number;
  cashbackStatus: string;
  appPoolStatus: string;
  coopPoolStatus: string;
  createdAt: string;
}
