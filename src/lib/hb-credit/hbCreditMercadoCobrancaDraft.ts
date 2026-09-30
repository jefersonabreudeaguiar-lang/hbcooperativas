const DRAFT_KEY = "hb-credit-mercado-cobranca-v1";

export type HbCreditMercadoCobrancaDraft = {
  v: 1;
  qrUrl: string;
  qrPayload: string;
  amountCents: number;
  descricao?: string;
  intentId: string;
  expiresAt: string;
  parceiroNome: string;
};

export function storeHbCreditMercadoCobrancaDraft(draft: HbCreditMercadoCobrancaDraft): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function peekHbCreditMercadoCobrancaDraft(): HbCreditMercadoCobrancaDraft | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HbCreditMercadoCobrancaDraft;
    if (parsed?.v !== 1 || !parsed.intentId || !parsed.qrUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHbCreditMercadoCobrancaDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
}
