import type { Cooperativa, MensalidadeConfig } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { cooperativaFromCloudRow, exigeSenhaCadastroCooperado, mensalidadeConfigComSenhaCadastro } from "@/utils/cooperativaCadastro";

export type CloudCooperativa = Pick<Cooperativa, "id" | "nome" | "cnpj"> & Partial<Cooperativa>;

function mapCloudRow(row: Record<string, unknown>): Cooperativa {
  const coop = cooperativaFromCloudRow(row);
  return { ...coop, cnpj: normalizeCnpj(coop.cnpj) };
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
  senhaCadastroCooperado?: string;
}

export async function verifyCadastroSenhaCooperado(
  cnpj: string,
  senha: string
): Promise<{ valid: boolean; configured: boolean; required: boolean }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { valid: false, configured: true, required: false };

  try {
    const res = await fetch("/api/cooperativas/verify-cadastro-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, senha }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) return { valid: false, configured: false, required: false };
    return {
      valid: Boolean(json.valid),
      configured: json.configured !== false,
      required: Boolean(json.required),
    };
  } catch {
    return { valid: false, configured: false, required: false };
  }
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

function scoreMensalidadeConfig(cfg?: MensalidadeConfig): number {
  if (!cfg) return 0;
  let score = 0;
  if ((cfg.valorPadrao ?? 0) > 0) score += 10;
  if ((cfg.mesesCobranca?.length ?? 0) > 0) score += 5;
  if (cfg.gerarAutomaticamente) score += 1;
  return score;
}

/** Mantém o valor fixo da mensalidade — não apaga config local com sync desatualizado. */
export function mergeMensalidadeConfig(
  local?: MensalidadeConfig,
  cloud?: MensalidadeConfig,
  localUpdatedAt?: string,
  cloudUpdatedAt?: string
): MensalidadeConfig | undefined {
  if (!local && !cloud) return undefined;
  if (!local) return cloud;
  if (!cloud) return local;

  const tLocal = Math.max(
    localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0,
    local.configSalvaEm ? new Date(local.configSalvaEm).getTime() : 0
  );
  const tCloud = Math.max(
    cloudUpdatedAt ? new Date(cloudUpdatedAt).getTime() : 0,
    cloud.configSalvaEm ? new Date(cloud.configSalvaEm).getTime() : 0
  );
  const sLocal = scoreMensalidadeConfig(local);
  const sCloud = scoreMensalidadeConfig(cloud);

  let base: MensalidadeConfig;
  if (sLocal > sCloud) base = local;
  else if (sCloud > sLocal) base = cloud;
  else if (tCloud > tLocal) base = cloud;
  else if (tLocal > tCloud) base = local;
  else base = (cloud.valorPadrao ?? 0) >= (local.valorPadrao ?? 0) ? cloud : local;

  const meses =
    (base.mesesCobranca?.length ?? 0) > 0
      ? base.mesesCobranca
      : (local.mesesCobranca?.length ?? 0) > 0
        ? local.mesesCobranca
        : cloud.mesesCobranca;

  return {
    ...base,
    valorPadrao: base.valorPadrao ?? local.valorPadrao ?? cloud.valorPadrao ?? 0,
    diaVencimento: base.diaVencimento ?? local.diaVencimento ?? cloud.diaVencimento ?? 10,
    diaLembrete: base.diaLembrete ?? local.diaLembrete ?? cloud.diaLembrete,
    lembreteAtivo: base.lembreteAtivo ?? local.lembreteAtivo ?? cloud.lembreteAtivo ?? true,
    lembreteTitulo: base.lembreteTitulo ?? local.lembreteTitulo ?? cloud.lembreteTitulo,
    lembreteTexto: base.lembreteTexto ?? local.lembreteTexto ?? cloud.lembreteTexto,
    gerarAutomaticamente:
      base.gerarAutomaticamente ?? local.gerarAutomaticamente ?? cloud.gerarAutomaticamente,
    mesesCobranca: meses,
    configSalvaEm: base.configSalvaEm ?? local.configSalvaEm ?? cloud.configSalvaEm,
  };
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
    const cur = cooperativas[idx];
    const tLocal = cur.updatedAt ? new Date(cur.updatedAt).getTime() : 0;
    const tCloud = cloudCoop.updatedAt ? new Date(cloudCoop.updatedAt).getTime() : 0;
    let mensalidadeConfig = mergeMensalidadeConfig(
      cur.mensalidadeConfig,
      cloudCoop.mensalidadeConfig,
      cur.updatedAt,
      cloudCoop.updatedAt
    );
    if (
      scoreMensalidadeConfig(cur.mensalidadeConfig) === 0 &&
      scoreMensalidadeConfig(cloudCoop.mensalidadeConfig) > 0
    ) {
      mensalidadeConfig = cloudCoop.mensalidadeConfig;
    }
    const next = [...cooperativas];
    next[idx] = {
      ...cur,
      ...cloudCoop,
      id: cur.id,
      mensalidadeConfig,
      senhaCadastroCooperado: cloudCoop.senhaCadastroCooperado ?? cur.senhaCadastroCooperado,
      updatedAt: tCloud > tLocal ? cloudCoop.updatedAt : cur.updatedAt,
    };
    return next;
  }
  return [...cooperativas, cloudCoop];
}
