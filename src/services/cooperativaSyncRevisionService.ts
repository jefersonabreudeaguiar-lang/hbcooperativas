import { secureApiFetch } from "@/lib/security/clientSession";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";

export async function fetchCooperativaCloudRevision(cnpj: string): Promise<CooperativaCloudRevision | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  try {
    const res = await secureApiFetch(
      `/api/cooperativa-sync?cnpj=${digits}&revisionOnly=1`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      configured?: boolean;
      revisionOnly?: boolean;
      operacionalUpdatedAt?: string | null;
      operationalResetVersion?: number;
      contratosUpdatedAt?: string | null;
      notasUpdatedAt?: string | null;
    };
    if (!json.configured || !json.revisionOnly) return null;
    return {
      operacionalUpdatedAt: json.operacionalUpdatedAt ?? null,
      operationalResetVersion: Number(json.operationalResetVersion ?? 0) || 0,
      contratosUpdatedAt: json.contratosUpdatedAt ?? null,
      notasUpdatedAt: json.notasUpdatedAt ?? null,
    };
  } catch {
    return null;
  }
}
