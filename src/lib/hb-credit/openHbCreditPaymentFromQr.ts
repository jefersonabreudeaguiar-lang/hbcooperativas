import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { validateCreditQr } from "@/services/creditApiService";
import { parseHbCreditQrPayload } from "@/lib/hb-credit/hbCreditQrPayload";
import {
  storeHbCreditPaymentDraft,
  storeHbCreditPendingQrScan,
} from "@/lib/hb-credit/hbCreditPaymentDraft";

/** Valida na nuvem e abre /pagar com rascunho pronto (PIN na hora). */
export async function prepareAndOpenHbCreditPaymentFromQrScan(
  router: AppRouterInstance,
  opts: { cnpj: string; cooperadoId: string; qrPayload: string }
): Promise<void> {
  const payload = opts.qrPayload.trim();
  if (!payload || opts.cnpj.length !== 14 || !opts.cooperadoId) {
    throw new Error("Não foi possível ler o QR Code.");
  }
  if (!parseHbCreditQrPayload(payload)) {
    throw new Error("QR Code inválido.");
  }

  const res = await validateCreditQr(opts.cnpj, opts.cooperadoId, payload, { fast: true });
  if (!res.intent || !res.limite || !res.parceiroNome) {
    throw new Error("Cobrança inválida ou expirada.");
  }

  storeHbCreditPaymentDraft({
    v: 1,
    qrPayload: payload,
    intent: res.intent,
    parceiroNome: res.parceiroNome,
    limite: res.limite,
    savedAt: new Date().toISOString(),
  });
  router.replace("/minha-conta-coop/pagar");
}

/** Legado: só grava pending e navega (pagar valida de novo — mais lento). */
export function openHbCreditPaymentFromQrScan(
  router: AppRouterInstance,
  opts: { cnpj: string; cooperadoId: string; qrPayload: string }
): void {
  const payload = opts.qrPayload.trim();
  if (!payload || opts.cnpj.length !== 14 || !opts.cooperadoId) {
    throw new Error("Não foi possível ler o QR Code.");
  }
  if (!parseHbCreditQrPayload(payload)) {
    throw new Error("QR Code inválido.");
  }

  storeHbCreditPendingQrScan({
    v: 1,
    qrPayload: payload,
    cnpj: opts.cnpj,
    cooperadoId: opts.cooperadoId,
    savedAt: new Date().toISOString(),
  });
  router.replace("/minha-conta-coop/pagar");
}

/** @deprecated use prepareAndOpenHbCreditPaymentFromQrScan */
export const openHbCreditPaymentFromQr = prepareAndOpenHbCreditPaymentFromQrScan;
