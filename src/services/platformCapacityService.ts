import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";

/** Limite de upload do operacional.json (cooperativaSyncStorage). */
export const OPERACIONAL_JSON_LIMIT_BYTES = 5 * 1024 * 1024;
/** Limite usado em fetchCooperadosFromStorage e cobrança HB. */
export const COOPERADOS_LIST_LIMIT = 500;
/** Limite conservador do localStorage no navegador (por aparelho). */
export const BROWSER_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
export const CAPACITY_WARN_RATIO = 0.8;

export type CapacityStatus = "ok" | "atencao" | "critico";

export interface CooperativaCapacityRow {
  cooperativaId: string;
  nome: string;
  cnpj: string;
  cooperadosCount: number;
  cooperadosLimit: number;
  cooperadosPercent: number;
  cooperadosStatus: CapacityStatus;
  cooperadosTruncated: boolean;
  operacionalBytes: number;
  operacionalLimitBytes: number;
  operacionalPercent: number;
  operacionalStatus: CapacityStatus;
  operacionalMissing: boolean;
  contratosBytes: number;
  alertas: string[];
}

export interface PlatformCapacitySnapshot {
  generatedAt: string;
  limits: {
    operacionalJsonMb: number;
    cooperadosList: number;
    browserStorageMb: number;
    warnPercent: number;
  };
  totais: {
    cooperativas: number;
    cooperados: number;
    operacionalBytes: number;
    comAlerta: number;
  };
  cooperativas: CooperativaCapacityRow[];
}

function ratioStatus(ratio: number): CapacityStatus {
  if (ratio >= 0.95) return "critico";
  if (ratio >= CAPACITY_WARN_RATIO) return "atencao";
  return "ok";
}

function fileSizeFromListEntry(entry: { metadata?: Record<string, unknown> | null }): number | null {
  const raw = entry.metadata?.size ?? entry.metadata?.contentLength;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function measureStorageFileBytes(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  listedSize: number | null
): Promise<number> {
  if (listedSize != null && listedSize > 0) return listedSize;
  const { data: blob, error } = await supabase.storage.from(bucket).download(path);
  if (error || !blob) return 0;
  return Buffer.byteLength(await blob.text(), "utf8");
}

export async function buildPlatformCapacitySnapshot(
  supabase: SupabaseClient
): Promise<PlatformCapacitySnapshot> {
  const { data: coopRows } = await supabase
    .from("cooperativas")
    .select("id, nome, cnpj")
    .order("nome", { ascending: true });

  const cooperativas: CooperativaCapacityRow[] = [];

  for (const row of coopRows ?? []) {
    const cnpj = normalizeCnpj(String(row.cnpj ?? ""));
    if (cnpj.length !== 14) continue;

    const { data: coopFiles } = await supabase.storage.from("hb-cooperados").list(cnpj, { limit: 1000 });
    const cooperadosCount = (coopFiles ?? []).filter((f) => f.name.endsWith(".json")).length;
    const cooperadosTruncated = cooperadosCount >= 1000;
    const cooperadosPercent = Math.round((cooperadosCount / COOPERADOS_LIST_LIMIT) * 100);
    const cooperadosStatus = ratioStatus(cooperadosCount / COOPERADOS_LIST_LIMIT);

    const { data: syncFiles } = await supabase.storage.from("hb-cooperativa-sync").list(cnpj, { limit: 20 });
    const opEntry = (syncFiles ?? []).find((f) => f.name === "operacional.json");
    const ctEntry = (syncFiles ?? []).find((f) => f.name === "contratos.json");

    const operacionalMissing = !opEntry;
    const operacionalBytes = opEntry
      ? await measureStorageFileBytes(
          supabase,
          "hb-cooperativa-sync",
          `${cnpj}/operacional.json`,
          fileSizeFromListEntry(opEntry)
        )
      : 0;
    const contratosBytes = ctEntry
      ? await measureStorageFileBytes(
          supabase,
          "hb-cooperativa-sync",
          `${cnpj}/contratos.json`,
          fileSizeFromListEntry(ctEntry)
        )
      : 0;

    const operacionalPercent = Math.round((operacionalBytes / OPERACIONAL_JSON_LIMIT_BYTES) * 100);
    const operacionalStatus = ratioStatus(operacionalBytes / OPERACIONAL_JSON_LIMIT_BYTES);

    const alertas: string[] = [];
    if (operacionalMissing) {
      alertas.push("operacional.json ainda não existe na nuvem.");
    } else if (operacionalStatus === "critico") {
      alertas.push("operacional.json quase no limite de 5 MB — risco de falha no sync.");
    } else if (operacionalStatus === "atencao") {
      alertas.push("operacional.json acima de 80% do limite (5 MB).");
    }
    if (cooperadosStatus === "critico" || cooperadosTruncated) {
      alertas.push("Lista de cooperados no limite de 500 — cobrança/preview pode ignorar cadastros.");
    } else if (cooperadosStatus === "atencao") {
      alertas.push("Cooperados acima de 80% do limite de listagem (500).");
    }

    cooperativas.push({
      cooperativaId: String(row.id),
      nome: String(row.nome ?? cnpj),
      cnpj,
      cooperadosCount,
      cooperadosLimit: COOPERADOS_LIST_LIMIT,
      cooperadosPercent,
      cooperadosStatus,
      cooperadosTruncated,
      operacionalBytes,
      operacionalLimitBytes: OPERACIONAL_JSON_LIMIT_BYTES,
      operacionalPercent,
      operacionalStatus,
      operacionalMissing,
      contratosBytes,
      alertas,
    });
  }

  const totaisCooperados = cooperativas.reduce((s, c) => s + c.cooperadosCount, 0);
  const totaisOperacional = cooperativas.reduce((s, c) => s + c.operacionalBytes, 0);

  return {
    generatedAt: new Date().toISOString(),
    limits: {
      operacionalJsonMb: OPERACIONAL_JSON_LIMIT_BYTES / (1024 * 1024),
      cooperadosList: COOPERADOS_LIST_LIMIT,
      browserStorageMb: BROWSER_STORAGE_LIMIT_BYTES / (1024 * 1024),
      warnPercent: Math.round(CAPACITY_WARN_RATIO * 100),
    },
    totais: {
      cooperativas: cooperativas.length,
      cooperados: totaisCooperados,
      operacionalBytes: totaisOperacional,
      comAlerta: cooperativas.filter((c) => c.alertas.length > 0).length,
    },
    cooperativas,
  };
}

export function capacityStatusLabel(status: CapacityStatus): string {
  switch (status) {
    case "critico":
      return "Crítico";
    case "atencao":
      return "Atenção";
    default:
      return "OK";
  }
}

export function capacityStatusClass(status: CapacityStatus): string {
  switch (status) {
    case "critico":
      return "text-red-700 bg-red-50 border-red-200";
    case "atencao":
      return "text-amber-800 bg-amber-50 border-amber-200";
    default:
      return "text-green-800 bg-green-50 border-green-200";
  }
}
