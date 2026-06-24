import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import { deleteAllNotasForCnpj } from "@/lib/supabase/notasStorage";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";

const ENTREGAS_BUCKET = "hb-entregas";
const SYNC_BUCKET = "hb-cooperativa-sync";

async function listStoragePrefixes(supabase: SupabaseClient, bucket: string): Promise<string[]> {
  const { data: folders, error } = await supabase.storage.from(bucket).list("", { limit: 500 });
  if (error || !folders?.length) return [];
  return folders
    .map((f) => normalizeCnpj(f.name))
    .filter((cnpj) => cnpj.length === 14);
}

export async function listCooperativaCnpjs(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("cooperativas").select("cnpj");
  const fromDb = error
    ? []
    : (data ?? [])
        .map((row) => normalizeCnpj(String(row.cnpj ?? "")))
        .filter((cnpj) => cnpj.length === 14);

  const [fromEntregas, fromSync] = await Promise.all([
    listStoragePrefixes(supabase, ENTREGAS_BUCKET),
    listStoragePrefixes(supabase, SYNC_BUCKET),
  ]);

  return [...new Set([...fromDb, ...fromEntregas, ...fromSync])];
}

export async function resetOperacionalSyncForCnpj(
  supabase: SupabaseClient,
  cnpj: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  const existing = await fetchOperacionalSync(supabase, digits);
  const payload: OperacionalSyncPayload = {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: 3,
    fullReset: true,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    config: existing?.config ?? { descontoPadraoCooperativa: 5 },
  };

  return uploadOperacionalSync(supabase, digits, payload);
}

export interface ResetOperationalCloudResult {
  cnpj: string;
  notasRemovidas: number;
  operacionalOk: boolean;
  error?: string;
}

export async function resetOperationalCloudForCnpj(
  supabase: SupabaseClient,
  cnpj: string
): Promise<ResetOperationalCloudResult> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) {
    return { cnpj: digits, notasRemovidas: 0, operacionalOk: false, error: "CNPJ inválido." };
  }

  const notas = await deleteAllNotasForCnpj(supabase, digits);
  const operacional = await resetOperacionalSyncForCnpj(supabase, digits);

  return {
    cnpj: digits,
    notasRemovidas: notas.removed,
    operacionalOk: operacional.ok,
    error: operacional.ok ? undefined : operacional.error,
  };
}

export async function resetOperationalCloudAll(
  supabase: SupabaseClient
): Promise<ResetOperationalCloudResult[]> {
  const cnpjs = await listCooperativaCnpjs(supabase);
  const results: ResetOperationalCloudResult[] = [];
  for (const cnpj of cnpjs) {
    results.push(await resetOperationalCloudForCnpj(supabase, cnpj));
  }
  return results;
}
