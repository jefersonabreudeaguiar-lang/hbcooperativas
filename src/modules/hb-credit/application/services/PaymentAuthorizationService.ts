export interface AuthorizePaymentInput {
  cooperativeCnpj: string;
  cooperadoId: string;
  intentId: string;
  idempotencyKey: string;
  /** PIN validado server-side — nunca logar. */
  pinVerified: boolean;
}

export interface AuthorizePaymentResult {
  transactionId: string;
  availableAfterCents: number;
  duplicate?: boolean;
}

/** Fase 0: contrato — autorização atômica implementada em fase posterior. */
export interface PaymentAuthorizationService {
  authorize(input: AuthorizePaymentInput): Promise<AuthorizePaymentResult>;
}
