export interface AsaasCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  externalReference?: string;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
}

export interface AsaasPaymentInput {
  customer: string;
  billingType: "PIX";
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  billingType: string;
  status: string;
  dueDate: string;
  invoiceUrl?: string;
  externalReference?: string;
  confirmedDate?: string;
  paymentDate?: string;
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

export interface AsaasWebhookPayload {
  id: string;
  event: string;
  dateCreated?: string;
  payment?: AsaasPayment;
}
