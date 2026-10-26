import type { AppData } from "@/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchNotasFromTable } from "@/lib/supabase/notasStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { cooperativaFromCloudRow } from "@/utils/cooperativaCadastro";
import { mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { emptyInitialData } from "@/mock/data";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  dedupeCooperadoV2CloudBuild,
  invalidateCooperadoV2CloudAppDataCache,
  writeCooperadoV2CloudAppDataCache,
} from "@/lib/cooperado-v2/server/cooperadoV2CloudAppDataCache";

export type CooperadoV2CloudBuildScope = "inicio" | "full";

async function buildCooperadoV2CloudAppDataOnce(
  cnpj: string,
  scope: CooperadoV2CloudBuildScope
): Promise<{ data: AppData; cooperativaId: string } | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", cnpj);
  if (!coopRows?.length) return null;
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const skipNotas = scope === "inicio";
  const [tableResult, cloudCooperados, operacional] = await Promise.all([
    skipNotas ? Promise.resolve({ notas: [], tableMissing: false }) : fetchNotasFromTable(sb, cnpj),
    fetchCooperadosFromStorage(sb, cnpj),
    fetchOperacionalSync(sb, cnpj),
  ]);

  const notas = tableResult.notas.map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  let data: AppData = {
    ...emptyInitialData,
    cooperativas: [coop],
    cooperados: cloudCooperados.map((c) => ({ ...c, cooperativaId: coop.id })),
    notasPedido: notas,
  };

  if (operacional) {
    data = mergeOperacionalIntoData(data, operacional, cnpj);
  }

  return { data, cooperativaId: coop.id };
}

/** Monta AppData mínimo só com dados da nuvem (sem localStorage). */
export async function buildCooperadoV2CloudAppData(
  cnpjDigits: string,
  opts?: { bypassCache?: boolean; scope?: CooperadoV2CloudBuildScope }
): Promise<{ data: AppData; cooperativaId: string } | null> {
  const cnpj = normalizeCnpj(cnpjDigits);
  if (cnpj.length !== 14) return null;
  const scope = opts?.scope ?? "full";
  if (opts?.bypassCache) {
    invalidateCooperadoV2CloudAppDataCache(cnpj, scope);
    const fresh = await buildCooperadoV2CloudAppDataOnce(cnpj, scope);
    if (fresh) writeCooperadoV2CloudAppDataCache(cnpj, fresh, scope);
    return fresh;
  }
  return dedupeCooperadoV2CloudBuild(
    cnpj,
    () => buildCooperadoV2CloudAppDataOnce(cnpj, scope),
    scope
  );
}
