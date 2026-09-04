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
