/**
 * BIC B2.2 — tipos de contrato (read-only).
 * Fatos = persistidos em AppData/nuvem; projeções = calculadas para exibição.
 * @see scripts/backups/BIC-B2.1-CONTRATO-CENTRAL-v0.md
 */
import type { NotaPedidoStatus } from "@/types";

/**
 * Contexto de tenant — obrigatório em toda operação BIC.
 *
 * Regra B2.4 (contrato, read-only):
 * - Válido: cooperadoId pertence à cooperativaId informada (AppData.cooperados).
 * - Inválido: cooperativaId incompatível com o cooperado — sem fallback cross-tenant.
 * - Indeterminado: cooperativaId ou cooperadoId ausente — BIC não assume tenant.
 * - Legado permanece autoridade financeira; esta regra governa apenas o contrato BIC.
 */
export interface BICContext {
  /** Fato — id da cooperativa no AppData. */
  cooperativaId: string;
  /** Fato — CNPJ 14 dígitos quando disponível (reforço de tenant). */
  cooperativaCnpj?: string;
  /** Fato — id do cooperado. */
  cooperadoId: string;
  /** Fato — mês YYYY-MM quando a operação for escopada a um mês. */
  mesReferencia?: string;
}

/** Resultado da validação pura de tenant (sem I/O). @see validateBicTenantContext */
export type BicTenantValidationStatus =
  | "valid"
  | "invalid_tenant_mismatch"
  | "invalid_cooperado_unknown"
  | "invalid_cnpj"
  | "indeterminate_missing_cooperativaId"
  | "indeterminate_missing_cooperadoId";

export interface BicTenantValidation {
  status: BicTenantValidationStatus;
  /** false = BIC não deve tratar o contexto como tenant confiável (sem fallback). */
  permitted: boolean;
  message: string;
  /** Preenchido em mismatch — tenant canônico do cooperado. */
  cooperadoCooperativaId?: string;
  /** Preenchido em mismatch — tenant solicitado no contexto. */
  contextCooperativaId?: string;
}

/** B2.9 — origem da projeção exposta pelos helpers *ParaExibicao (somente memória). */
export type BicProjectionSource = "bic" | "legacy";

/** Motivo de fallback = status de tenant quando BIC não autoriza (espelha guarda B2.4). */
export type BicExibicaoFallbackReason = Exclude<BicTenantValidationStatus, "valid">;

/** Metadados internos — não persistir, não enviar à UI como campo visível. */
export type BicExibicaoObservability = {
  source: BicProjectionSource;
  fallback: boolean;
  bicProjectionAuthorized: boolean;
  fallbackReason?: BicExibicaoFallbackReason;
};

/** Valor financeiro/de exibição + contrato de origem (B2.9). */
export type BicExibicaoEnvelope<T> = {
  value: T;
  observability: BicExibicaoObservability;
};

/**
 * Agregação B2.5 para shadow compare (sem I/O).
 * - valid: tenant coerente — projeção BIC pode ser autorizada no contrato shadow.
 * - invalid: tenant rejeitado — projeção BIC não autorizada; legado só diagnóstico.
 * - indeterminate: ids ausentes — sem inferência nem fallback.
 */
export type BicShadowTenantStatus = "valid" | "invalid" | "indeterminate";

export function bicShadowTenantStatusFromValidation(
  status: BicTenantValidationStatus
): BicShadowTenantStatus {
  if (status === "valid") return "valid";
  if (
    status === "indeterminate_missing_cooperativaId" ||
    status === "indeterminate_missing_cooperadoId"
  ) {
    return "indeterminate";
  }
  return "invalid";
}

/** Fato — nota de pedido (espelho de NotaPedido). */
export interface BICNota {
  notaId: string;
  cooperativaId: string;
  cooperadoId: string;
  status: NotaPedidoStatus;
  valorBruto: number;
  valorLiquido: number;
  valorDesconto: number;
  percentualDescontoCooperativa: number;
  createdAt: string;
  updatedAt: string;
  /** Fato servidor — presente após sync SQL, opcional no tipo base. */
  serverUpdatedAt?: string;
}

/** Fato — entrega operacional (nota ou legado Entrega). */
export interface BICEntrega {
  entregaId: string;
  notaId?: string;
  cooperadoId: string;
  quantidade: number;
  valor: number;
  status: NotaPedidoStatus | string;
}

/** Fato (+ chave sintética de conferenciaId). */
export interface BICConferencia {
  conferenciaId: string;
  notaId: string;
  responsavelId?: string;
  status: NotaPedidoStatus;
  timestamp?: string;
}

/** Fato — pagamento cooperado (espelho PagamentoCooperadoRegistro). */
export interface BICPagamento {
  pagamentoId: string;
  cooperadoId: string;
  cooperativaId: string;
  valorBruto: number;
  valorLiquido: number;
  status: "aguardando_confirmacao" | "confirmado";
  pagoEm: string;
  /** Projeção — derivada de assinatura/recibo, não persistida isolada. */
  assinaturaPendente?: boolean;
}

/** Fato — crédito HB (referência; ledger permanece no módulo HB). */
export interface BICCredito {
  creditoId: string;
  cooperadoId: string;
  valor: number;
  origem: string;
  status: string;
  timestamp?: string;
}

/** Projeção financeira cooperado (M6/M7/M8 agregados). */
export interface BICProjecaoFinanceira {
  /** Projeção */
  valorBruto?: number;
  /** Projeção */
  descontos?: number;
  /** Projeção — efeito HB sobre A receber */
  hbCredito?: number;
  /** Projeção — leitura de pagamentos confirmados/aguardando */
  pagamentosConsiderados?: number;
  /** Projeção — motor M6 */
  valorAReceber: number;
  /** Projeção — motor M8 */
  aguardandoAssinatura: boolean;
  /** Projeção */
  mesReferencia?: string;
  valorRecibo?: number;
}
