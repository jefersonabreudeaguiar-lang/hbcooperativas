import { secureApiFetch } from "@/lib/security/clientSession";
import type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";

export interface HbChargePixResponse {
  ok: boolean;
  error?: string;
  chargeId?: string;
  status?: string;
  breakdown?: HbUnifiedChargeBreakdown;
  pix?: {
    payload: string;
    encodedImage: string;
  };
  invoiceUrl?: string | null;
}

export async function fetchHbChargePreview(
  cnpj: string,
  mesReferencia?: string
): Promise<HbUnifiedChargeBreakdown> {
  const qs = new URLSearchParams({ cnpj });
  if (mesReferencia) qs.set("mes", mesReferencia);
  const res = await secureApiFetch(`/api/payments/hb-charge?${qs.toString()}`, { cache: "no-store" });
  const json = (await res.json()) as { ok?: boolean; error?: string; breakdown?: HbUnifiedChargeBreakdown };
  if (!res.ok || !json.ok || !json.breakdown) {
    throw new Error(json.error ?? "Não foi possível calcular a cobrança.");
  }
  return json.breakdown;
}

export async function createHbAsaasCharge(
  cnpj: string,
  mesReferencia?: string
): Promise<HbChargePixResponse> {
  const res = await secureApiFetch("/api/payments/hb-charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, mesReferencia }),
  });
  return (await res.json()) as HbChargePixResponse;
}
