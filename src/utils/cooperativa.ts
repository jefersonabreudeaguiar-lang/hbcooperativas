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

export function getUserCooperativaNome(user: Omit<User, "password">, data: AppData): string {
  const id = getUserCooperativaId(user, data);
  return getCooperativaNome(data, id);
}
