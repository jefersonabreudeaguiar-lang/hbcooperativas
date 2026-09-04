import { secureApiFetch } from "@/lib/security/clientSession";
import type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";

export async function fetchAdminHbChargePreview(
  cnpj: string,
  mesReferencia?: string
): Promise<HbUnifiedChargeBreakdown> {
  const qs = new URLSearchParams({ cnpj });
  if (mesReferencia) qs.set("mes", mesReferencia);
  const res = await secureApiFetch(`/api/admin/hb-charge-preview?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as { ok?: boolean; error?: string; breakdown?: HbUnifiedChargeBreakdown };
  if (!res.ok || !json.ok || !json.breakdown) {
    throw new Error(json.error ?? "Não foi possível calcular a cobrança unificada.");
  }
  return json.breakdown;
}

export async function createAdminHbAsaasCharge(
  cnpj: string,
  mesReferencia?: string
): Promise<{
  ok: boolean;
  error?: string;
  chargeId?: string;
  pixGenerated?: boolean;
}> {
  const res = await secureApiFetch("/api/admin/hb-asaas-charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, mesReferencia }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    chargeId?: string;
    pix?: { payload?: string };
  };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error ?? "Não foi possível gerar PIX Asaas na nuvem." };
  }
  return { ok: true, chargeId: json.chargeId, pixGenerated: Boolean(json.pix?.payload) };
}
