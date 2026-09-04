import type { CobrancaSaasPricing } from "@/services/cobrancaSaasService";

export interface HbChargeCooperadoLine {
  id: string;
  nome: string;
  status: string;
  valorUnitarioCents: number;
}

export interface HbChargeRepasseLine {
  allocationId: string;
  transactionId: string;
  partnerNome: string;
  grossCents: number;
  discountCents: number;
  appCents: number;
  createdAt: string;
}

export interface HbChargeLineItem {
  kind: "saas_mensalidade" | "conta_coop_repasse";
  label: string;
  detail: string;
  amountCents: number;
}

export interface HbUnifiedChargeBreakdown {
  generatedAt: string;
  cooperativeCnpj: string;
  cooperativeNome: string;
  cooperativeId: string;
  mesReferenciaContaCoop: string;
  repasseFechamentoLabel?: string | null;
  periodoSaas: {
    periodoId: string;
    label: string;
    vencimento: string;
    mesReferencia: string;
  } | null;
  saasDue: boolean;
  repasseDue: boolean;
  pricing: CobrancaSaasPricing;
  cooperados: HbChargeCooperadoLine[];
  repasseCompras: HbChargeRepasseLine[];
  lineItems: HbChargeLineItem[];
  saasSubtotalCents: number;
  repasseSubtotalCents: number;
  totalCents: number;
  receiver: {
    cpf: string;
    nome: string;
  };
}
