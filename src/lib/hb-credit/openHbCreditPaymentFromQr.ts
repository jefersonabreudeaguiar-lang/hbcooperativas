import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { storeHbCreditPaymentDraft, type HbCreditPaymentDraft } from "@/lib/hb-credit/hbCreditPaymentDraft";
import { validateCreditQr } from "@/services/creditApiService";

export async function openHbCreditPaymentFromQr(
  router: AppRouterInstance,
  opts: { cnpj: string; cooperadoId: string; qrPayload: string }
): Promise<void> {
  const payload = opts.qrPayload.trim();
  if (!payload || opts.cnpj.length !== 14 || !opts.cooperadoId) {
    throw new Error("Não foi possível ler o QR Code.");
  }

  const res = await validateCreditQr(opts.cnpj, opts.cooperadoId, payload);
  if (!res.intent || !res.limite || !res.parceiroNome) {
    throw new Error("Cobrança inválida ou expirada.");
  }

  const draft: HbCreditPaymentDraft = {
    v: 1,
    qrPayload: payload,
    intent: res.intent,
    parceiroNome: res.parceiroNome,
    limite: res.limite,
    savedAt: new Date().toISOString(),
  };
  storeHbCreditPaymentDraft(draft);
  router.replace("/minha-conta-coop/pagar");
}
