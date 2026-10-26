import type { AppData } from "@/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchNotasFromTable } from "@/lib/supabase/notasStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { cooperativaFromCloudRow } from "@/utils/cooperativaCadastro";
import { mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { emptyInitialData } from "@/mock/data";
import { normalizeCnpj } from "@/utils/cooperativa";

/** Monta AppData mínimo só com dados da nuvem (sem localStorage). */
export async function buildCooperadoV2CloudAppData(
  cnpjDigits: string
): Promise<{ data: AppData; cooperativaId: string } | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const cnpj = normalizeCnpj(cnpjDigits);
  if (cnpj.length !== 14) return null;

  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", cnpj);
  if (!coopRows?.length) return null;
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const [tableResult, cloudCooperados, operacional] = await Promise.all([
    fetchNotasFromTable(sb, cnpj),
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
