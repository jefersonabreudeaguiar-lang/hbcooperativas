import type { HbCreditPaymentIntent } from "../../domain/entities";
import type { MoneyCents } from "../../shared/money";

export interface CreatePaymentIntentInput {
  cooperativeCnpj: string;
  partnerId: string;
  amountCents: MoneyCents;
  description?: string;
  idempotencyKey?: string;
}

export interface PaymentIntentService {
  create(input: CreatePaymentIntentInput): Promise<HbCreditPaymentIntent>;
  cancel(intentId: string, cooperativeCnpj: string, partnerId: string): Promise<void>;
  getById(intentId: string, cooperativeCnpj: string): Promise<HbCreditPaymentIntent | null>;
}
