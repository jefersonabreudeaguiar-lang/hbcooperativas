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
  dedupeJefersonRebuildCloudBuild,
  invalidateJefersonRebuildCloudCache,
  writeJefersonRebuildCloudCache,
} from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildCloudCache";

export type JefersonRebuildCloudScope = "inicio" | "full";

async function buildOnce(
  cnpj: string,
  scope: JefersonRebuildCloudScope
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

export async function buildJefersonRebuildCloudAppData(
  cnpjDigits: string,
  opts?: { bypassCache?: boolean; scope?: JefersonRebuildCloudScope }
): Promise<{ data: AppData; cooperativaId: string } | null> {
  const cnpj = normalizeCnpj(cnpjDigits);
  if (cnpj.length !== 14) return null;
  const scope = opts?.scope ?? "full";
  if (opts?.bypassCache) {
    invalidateJefersonRebuildCloudCache(cnpj, scope);
    const fresh = await buildOnce(cnpj, scope);
    if (fresh) writeJefersonRebuildCloudCache(cnpj, fresh, scope);
    return fresh;
  }
  return dedupeJefersonRebuildCloudBuild(cnpj, () => buildOnce(cnpj, scope), scope);
}
