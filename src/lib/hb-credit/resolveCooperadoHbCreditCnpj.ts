import type { User } from "@/types";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

/** CNPJ da cooperativa (14 dígitos) para APIs HB Créditos — sessão ou AppData. */
export function resolveCooperadoHbCreditCnpjDigits(
  user: Omit<User, "password"> | null | undefined
): string {
  if (!user) return "";
  if (user.cooperativaCnpj) {
    const fromUser = normalizeCnpj(user.cooperativaCnpj);
    if (fromUser.length === 14) return fromUser;
  }
  if (!isAppDataWarm()) return "";
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return "";
  const coop = data.cooperativas.find((c) => c.id === coopId);
  if (!coop?.cnpj) return "";
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : "";
}
