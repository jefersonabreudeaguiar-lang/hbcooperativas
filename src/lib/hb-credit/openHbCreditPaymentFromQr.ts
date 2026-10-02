import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { validateCreditQr } from "@/services/creditApiService";
import { parseHbCreditQrPayload } from "@/lib/hb-credit/hbCreditQrPayload";
import {
  clearHbCreditPendingQrScan,
  peekHbCreditPaymentDraft,
  storeHbCreditPaymentDraft,
  storeHbCreditPendingQrScan,
  type HbCreditPaymentDraft,
} from "@/lib/hb-credit/hbCreditPaymentDraft";

type QrValidateOpts = { cnpj: string; cooperadoId: string; qrPayload: string };

let inflightValidate: { key: string; promise: Promise<HbCreditPaymentDraft | null> } | null = null;

function qrValidateKey(opts: QrValidateOpts): string {
  return `${opts.cnpj}:${opts.cooperadoId}:${opts.qrPayload.trim()}`;
}

/** Uma validação por QR em voo — scan e /pagar compartilham a mesma requisição. */
export function kickHbCreditQrValidation(opts: QrValidateOpts): Promise<HbCreditPaymentDraft | null> {
  const payload = opts.qrPayload.trim();
  const key = qrValidateKey({ ...opts, qrPayload: payload });
  if (inflightValidate?.key === key) return inflightValidate.promise;

  const promise = validateCreditQr(opts.cnpj, opts.cooperadoId, payload, { fast: true })
    .then((res) => {
      if (!res.intent || !res.limite || !res.parceiroNome) return null;
      const draft: HbCreditPaymentDraft = {
        v: 1,
        qrPayload: payload,
        intent: res.intent,
        parceiroNome: res.parceiroNome,
        limite: res.limite,
        savedAt: new Date().toISOString(),
      };
      storeHbCreditPaymentDraft(draft);
      clearHbCreditPendingQrScan();
      return draft;
    })
    .finally(() => {
      if (inflightValidate?.key === key) inflightValidate = null;
    });

  inflightValidate = { key, promise };
  return promise;
}

/** Navega na hora; validação na nuvem em paralelo (rascunho pronto antes ou na tela PIN). */
export function prepareAndOpenHbCreditPaymentFromQrScan(
  router: AppRouterInstance,
  opts: QrValidateOpts
): void {
  const payload = opts.qrPayload.trim();
  if (!payload || opts.cnpj.length !== 14 || !opts.cooperadoId) {
    throw new Error("Não foi possível ler o QR Code.");
  }
  if (!parseHbCreditQrPayload(payload)) {
    throw new Error("QR Code inválido.");
  }

  const cached = peekHbCreditPaymentDraft();
  if (cached?.qrPayload === payload) {
    router.replace("/minha-conta-coop/pagar");
    return;
  }

  storeHbCreditPendingQrScan({
    v: 1,
    qrPayload: payload,
    cnpj: opts.cnpj,
    cooperadoId: opts.cooperadoId,
    savedAt: new Date().toISOString(),
  });
  void kickHbCreditQrValidation({ ...opts, qrPayload: payload });
  router.replace("/minha-conta-coop/pagar");
}

/** Legado: só grava pending e navega (pagar valida de novo — mais lento). */
export function openHbCreditPaymentFromQrScan(
  router: AppRouterInstance,
  opts: QrValidateOpts
): void {
  prepareAndOpenHbCreditPaymentFromQrScan(router, opts);
}

/** @deprecated use prepareAndOpenHbCreditPaymentFromQrScan */
export const openHbCreditPaymentFromQr = prepareAndOpenHbCreditPaymentFromQrScan;
