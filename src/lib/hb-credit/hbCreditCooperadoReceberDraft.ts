const DRAFT_KEY = "hb-credit-cooperado-receber-v1";

export type HbCreditCooperadoReceberDraft = {
  v: 1;
  qrUrl?: string;
  qrPayload: string;
  amountCents: number;
  descricao?: string;
  intentId: string;
  expiresAt: string;
  receiverNome: string;
};

export function storeHbCreditCooperadoReceberDraft(draft: HbCreditCooperadoReceberDraft): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function peekHbCreditCooperadoReceberDraft(): HbCreditCooperadoReceberDraft | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HbCreditCooperadoReceberDraft;
    if (parsed?.v !== 1 || !parsed.intentId || !parsed.qrPayload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHbCreditCooperadoReceberDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
}
