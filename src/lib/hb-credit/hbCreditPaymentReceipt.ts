/** Último comprovante HB — recuperação se a tela de pagamento fechar antes do sucesso. */
const RECEIPT_KEY = "hb-credit-last-receipt-v1";

export type HbCreditPaymentReceipt = {
  v: 1;
  receiptCode: string;
  transacaoId: string;
  amountCents: number;
  debitoCents: number;
  parceiroNome: string;
  cooperadoNome: string;
  cnpj: string;
  cooperadoId: string;
  paidAt: string;
  saldoAposCents?: number;
  pagamentoCooperado?: boolean;
};

export function storeHbCreditPaymentReceipt(receipt: HbCreditPaymentReceipt): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
}

export function peekHbCreditPaymentReceipt(): HbCreditPaymentReceipt | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(RECEIPT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HbCreditPaymentReceipt;
    if (parsed?.v !== 1 || !parsed.receiptCode || !parsed.transacaoId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHbCreditPaymentReceipt(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(RECEIPT_KEY);
}

export function formatHbCreditReceiptShareText(r: HbCreditPaymentReceipt): string {
  const valor = (r.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const quando = new Date(r.paidAt).toLocaleString("pt-BR");
  return [
    "HB Créditos — Comprovante de pagamento",
    `Valor: ${valor}`,
    `Para: ${r.parceiroNome}`,
    `De: ${r.cooperadoNome}`,
    `Código: ${r.receiptCode}`,
    `ID: ${r.transacaoId}`,
    `Data: ${quando}`,
    "Pagamento confirmado na cooperativa.",
  ].join("\n");
}
