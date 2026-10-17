import type { AppData, Cooperativa, User } from "@/types";

export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export function formatCnpj(cnpj: string): string {
  const d = normalizeCnpj(cnpj);
  if (d.length !== 14) return cnpj;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function findCooperativaByCnpj(data: AppData, cnpj: string): Cooperativa | undefined {
  const digits = normalizeCnpj(cnpj.trim());
  if (digits.length !== 14) return undefined;
  return data.cooperativas.find((c) => {
    const stored = normalizeCnpj(String(c.cnpj ?? ""));
    const ativa = !c.status || c.status === "ativa";
    return stored === digits && ativa;
  });
}

export function getCooperativaById(data: AppData, id?: string): Cooperativa | undefined {
  if (!id) return undefined;
  return data.cooperativas.find((c) => c.id === id);
}

export function getCooperativaNome(data: AppData, id?: string): string {
  return getCooperativaById(data, id)?.nome ?? "";
}

export function getUserCooperativaId(user: Omit<User, "password">, data: AppData): string | undefined {
  if (user.cooperativaId) return user.cooperativaId;
  if (user.cooperadoId) {
    return data.cooperados.find((c) => c.id === user.cooperadoId)?.cooperativaId;
  }
  return undefined;
}

/** Cooperativa usada no painel /admin quando o vínculo do usuário não está explícito. */
export function resolveAdminCooperativaId(user: Omit<User, "password">, data: AppData): string | undefined {
  const fromUser = getUserCooperativaId(user, data);
  if (fromUser) return fromUser;
  if (user.cooperativaCnpj) {
    const coop = findCooperativaByCnpj(data, user.cooperativaCnpj);
    if (coop) return coop.id;
  }
  return data.cooperativas.find((c) => c.status !== "inativa")?.id;
}

/**
 * Cooperativa do painel da gestão. JWT/sessão sem cooperativaId ainda enxerga
 * catálogo, em aberto e pagos pelo CNPJ ou pela única cooperativa ativa.
 */
export function resolveGestaoCooperativaId(
  user: Omit<User, "password"> | null | undefined,
  data: AppData | null | undefined
): string | undefined {
  if (!user) return undefined;
  if (!data) return user.cooperativaId?.trim() || undefined;

  const direct = getUserCooperativaId(user, data);
  if (direct && data.cooperativas.some((c) => c.id === direct && c.status !== "inativa")) {
    return direct;
  }

  const byCnpj = user.cooperativaCnpj ? findCooperativaByCnpj(data, user.cooperativaCnpj) : undefined;
  if (byCnpj) return byCnpj.id;

  const ativas = data.cooperativas.filter((c) => c.status !== "inativa");
  if (ativas.length === 1) return ativas[0].id;

  const comOperacao = ativas.find(
    (c) =>
      data.instituicoes.some((i) => i.cooperativaId === c.id) ||
      data.cooperados.some((co) => co.cooperativaId === c.id && co.status === "ativo")
  );
  return comOperacao?.id ?? direct;
}

export function getUserCooperativaNome(user: Omit<User, "password">, data: AppData): string {
  const id = getUserCooperativaId(user, data);
  return getCooperativaNome(data, id);
}
