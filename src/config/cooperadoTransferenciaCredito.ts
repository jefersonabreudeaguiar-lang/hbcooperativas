/** Transferência de saldo HB entre cooperados da mesma cooperativa (QR “Receber”). */
const DISABLED = new Set(["0", "false", "off", "no"]);

export function isCooperadoTransferenciaCreditoEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_COOPERADO_TRANSFERENCIA_CREDITO ?? "1").trim().toLowerCase();
  return !DISABLED.has(raw);
}

export const COOPERADO_TRANSFER_INTENT_ID_PREFIX = "ctrf_";

export function isCooperadoTransferIntentId(intentId: string): boolean {
  return intentId.startsWith(COOPERADO_TRANSFER_INTENT_ID_PREFIX);
}
