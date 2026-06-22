import type { Cooperativa, MensalidadeConfig } from "@/types";

const SENHA_KEY = "senhaCadastroCooperado";

export function senhaCadastroFromConfig(
  config: MensalidadeConfig | Record<string, unknown> | null | undefined
): string | undefined {
  if (!config || typeof config !== "object") return undefined;
  const raw = (config as Record<string, unknown>)[SENHA_KEY];
  const trimmed = String(raw ?? "").trim();
  return trimmed || undefined;
}

export function exigeSenhaCadastroCooperado(
  cooperativa: Pick<Cooperativa, "senhaCadastroCooperado"> | null | undefined,
  config?: MensalidadeConfig | Record<string, unknown> | null
): boolean {
  const senha = cooperativa?.senhaCadastroCooperado ?? senhaCadastroFromConfig(config);
  return Boolean(senha?.trim());
}

export function mensalidadeConfigComSenhaCadastro(
  config: MensalidadeConfig | undefined,
  senhaCadastroCooperado?: string
): MensalidadeConfig | undefined {
  const trimmed = senhaCadastroCooperado?.trim();
  const base = { ...(config ?? {}) } as MensalidadeConfig & Record<string, unknown>;
  if (trimmed) {
    base[SENHA_KEY] = trimmed;
  } else {
    delete base[SENHA_KEY];
  }
  if (Object.keys(base).length === 0) return undefined;
  return base as unknown as MensalidadeConfig;
}

export function mensalidadeConfigSemSenhaCadastro(
  config: MensalidadeConfig | Record<string, unknown> | null | undefined
): MensalidadeConfig | undefined {
  if (!config || typeof config !== "object") return undefined;
  const next = { ...config } as Record<string, unknown>;
  delete next[SENHA_KEY];
  if (Object.keys(next).length === 0) return undefined;
  return next as unknown as MensalidadeConfig;
}

export function cooperativaFromCloudRow(row: Record<string, unknown>): Cooperativa {
  const mensalidadeRaw = row.mensalidade_config as MensalidadeConfig | null | undefined;
  const senhaCadastroCooperado = senhaCadastroFromConfig(mensalidadeRaw);
  return {
    id: String(row.id),
    nome: String(row.nome),
    cnpj: String(row.cnpj).replace(/\D/g, ""),
    endereco: String(row.endereco ?? ""),
    telefone: String(row.telefone ?? ""),
    responsavel: String(row.responsavel ?? ""),
    email: String(row.email ?? ""),
    status: (row.status as Cooperativa["status"]) ?? "ativa",
    mensalidadeConfig: mensalidadeConfigSemSenhaCadastro(mensalidadeRaw),
    senhaCadastroCooperado,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}
