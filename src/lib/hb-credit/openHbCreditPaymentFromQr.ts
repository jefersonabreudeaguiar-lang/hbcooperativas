import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { parseHbCreditQrPayload } from "@/lib/hb-credit/hbCreditQrPayload";
import { storeHbCreditPendingQrScan } from "@/lib/hb-credit/hbCreditPaymentDraft";

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

/** @deprecated use openHbCreditPaymentFromQrScan */
export const openHbCreditPaymentFromQr = openHbCreditPaymentFromQrScan;
