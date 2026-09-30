import type { ContaCoopIntent, ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

const DRAFT_KEY = "hb-credit-payment-draft-v1";

export type HbCreditPaymentDraft = {
  v: 1;
  qrPayload: string;
  intent: ContaCoopIntent;
  parceiroNome: string;
  limite: ContaCoopLimiteCooperado;
  savedAt: string;
};

export function storeHbCreditPaymentDraft(draft: HbCreditPaymentDraft): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function peekHbCreditPaymentDraft(): HbCreditPaymentDraft | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HbCreditPaymentDraft;
    if (parsed?.v !== 1 || !parsed.intent?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function consumeHbCreditPaymentDraft(): HbCreditPaymentDraft | null {
  const draft = peekHbCreditPaymentDraft();
  if (draft) clearHbCreditPaymentDraft();
  return draft;
}

export function clearHbCreditPaymentDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
}
