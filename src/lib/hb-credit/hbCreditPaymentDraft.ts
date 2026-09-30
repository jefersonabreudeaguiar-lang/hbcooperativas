import type { ContaCoopIntent, ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

const DRAFT_KEY = "hb-credit-payment-draft-v1";
const PENDING_QR_KEY = "hb-credit-pending-qr-v1";

export type HbCreditPaymentDraft = {
  v: 1;
  qrPayload: string;
  intent: ContaCoopIntent;
  parceiroNome: string;
  limite: ContaCoopLimiteCooperado;
  savedAt: string;
};

export type HbCreditPendingQrScan = {
  v: 1;
  qrPayload: string;
  cnpj: string;
  cooperadoId: string;
  savedAt: string;
};

export function storeHbCreditPaymentDraft(draft: HbCreditPaymentDraft): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PENDING_QR_KEY);
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function storeHbCreditPendingQrScan(pending: HbCreditPendingQrScan): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
  sessionStorage.setItem(PENDING_QR_KEY, JSON.stringify(pending));
}

export function peekHbCreditPendingQrScan(): HbCreditPendingQrScan | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(PENDING_QR_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HbCreditPendingQrScan;
    if (parsed?.v !== 1 || !parsed.qrPayload || parsed.cnpj?.length !== 14 || !parsed.cooperadoId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearHbCreditPendingQrScan(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PENDING_QR_KEY);
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
