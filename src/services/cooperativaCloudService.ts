import type { Cooperativa, MensalidadeConfig } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

export type CloudCooperativa = Pick<Cooperativa, "id" | "nome" | "cnpj"> & Partial<Cooperativa>;

function mapCloudRow(row: Record<string, unknown>): Cooperativa {
  const mensalidadeRaw = row.mensalidade_config as MensalidadeConfig | null | undefined;
  return {
    id: String(row.id),
    nome: String(row.nome),
    cnpj: normalizeCnpj(String(row.cnpj)),
    endereco: String(row.endereco ?? ""),
    telefone: String(row.telefone ?? ""),
    responsavel: String(row.responsavel ?? ""),
    email: String(row.email ?? ""),
    status: (row.status as Cooperativa["status"]) ?? "ativa",
    mensalidadeConfig: mensalidadeRaw ?? undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export type CloudStatus = "ok" | "not_configured" | "migration_pending" | "error";

export async function fetchCloudStatus(): Promise<{ status: CloudStatus; message?: string }> {
  try {
    const res = await fetch("/api/cooperativas/status", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return {
      status: (json.status as CloudStatus) ?? "error",
      message: json.message as string | undefined,
    };
  } catch {
    return { status: "error", message: "Sem conexão com o servidor." };
  }
}

/** Consulta CNPJ na nuvem via API route. */
export async function fetchCooperativaByCnpjFromCloud(
  cnpj: string
): Promise<Cooperativa | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;

  try {
    const res = await fetch(`/api/cooperativas/lookup?cnpj=${digits}`, {
      method: "GET",
      cache: "no-store",
    });

    if (res.status === 404) return null;
    if (res.status === 503) return null;

    if (!res.ok) {
      console.warn("[cloud] lookup falhou:", res.status);
      return null;
    }

    const json = await res.json();
    if (!json.found || !json.cooperativa) return null;
    return mapCloudRow(json.cooperativa);
  } catch (err) {
    console.warn("[cloud] lookup erro:", err);
    return null;
  }
}

export interface RegisterCooperativaCloudInput {
  nome: string;
  cnpj: string;
  responsavel: string;
  email: string;
  telefone?: string;
  endereco?: string;
}

export async function registerCooperativaInCloud(
  input: RegisterCooperativaCloudInput
): Promise<{ success: true; cooperativa: Cooperativa } | { success: false; error: string; offline?: boolean }> {
  try {
    const res = await fetch("/api/cooperativas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const json = await res.json().catch(() => ({}));

    if (res.status === 503) {
      const msg =
        (json.error as string | undefined) ??
        (json.migrationPending
          ? "Crie a tabela cooperativas no Supabase (SQL Editor)."
          : "Nuvem não configurada. Verifique as variáveis do Supabase.");
      return { success: false, error: msg, offline: true };
    }

    if (res.status === 409) {
      const existing = await fetchCooperativaByCnpjFromCloud(input.cnpj);
      if (existing) return { success: true, cooperativa: existing };
      return { success: false, error: json.error ?? "Este CNPJ já está cadastrado na nuvem." };
    }

    if (!res.ok) {
      return { success: false, error: json.error ?? "Erro ao cadastrar na nuvem." };
    }

    return { success: true, cooperativa: mapCloudRow(json.cooperativa) };
  } catch {
    return { success: false, error: "Sem conexão com o servidor.", offline: true };
  }
}

/** Envia cooperativa local para a nuvem se o CNPJ ainda não existir lá. */
export async function syncCooperativaToCloud(
  cooperativa: Cooperativa
): Promise<{ success: true; cooperativa: Cooperativa } | { success: false; error: string }> {
  const existing = await fetchCooperativaByCnpjFromCloud(cooperativa.cnpj);
  if (existing) return { success: true, cooperativa: existing };

  return registerCooperativaInCloud({
    nome: cooperativa.nome,
    cnpj: cooperativa.cnpj,
    responsavel: cooperativa.responsavel ?? "",
    email: cooperativa.email ?? "",
    telefone: cooperativa.telefone,
    endereco: cooperativa.endereco,
  });
}

/** Sincroniza cooperativa da nuvem para o armazenamento local. */
export function mergeCooperativaIntoData(
  cooperativas: Cooperativa[],
  cloudCoop: Cooperativa
): Cooperativa[] {
  const idx = cooperativas.findIndex(
    (c) => c.id === cloudCoop.id || normalizeCnpj(c.cnpj) === normalizeCnpj(cloudCoop.cnpj)
  );
  if (idx >= 0) {
    const next = [...cooperativas];
    next[idx] = { ...next[idx], ...cloudCoop, updatedAt: cloudCoop.updatedAt };
    return next;
  }
  return [...cooperativas, cloudCoop];
}
