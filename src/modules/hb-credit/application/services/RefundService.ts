export interface RefundService {
  createRefund(
    cooperativeCnpj: string,
    originalTransactionId: string,
    actorId: string,
    idempotencyKey: string
  ): Promise<{ refundId: string; refundTransactionId: string }>;
}
