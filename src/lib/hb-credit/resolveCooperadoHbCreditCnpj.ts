import type { AppData, User } from "@/types";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { lerCnpjHbCreditPersistidoParaCooperado } from "@/lib/hb-credit/hbCreditAccountPersistencia";

function cnpjFromAppData(user: Omit<User, "password">, data: AppData): string {
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return "";
  const coop = data.cooperativas.find((c) => c.id === coopId);
  if (!coop?.cnpj) return "";
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : "";
}

/** CNPJ da cooperativa (14 dígitos) para APIs HB Créditos — sessão, cache HB ou AppData. */
export function resolveCooperadoHbCreditCnpjDigits(
  user: Omit<User, "password"> | null | undefined,
  data?: AppData | null
): string {
  if (!user) return "";
  if (user.cooperativaCnpj) {
    const fromUser = normalizeCnpj(user.cooperativaCnpj);
    if (fromUser.length === 14) return fromUser;
  }
  if (user.cooperadoId) {
    const fromHbCache = lerCnpjHbCreditPersistidoParaCooperado(user.cooperadoId);
    if (fromHbCache.length === 14) return fromHbCache;
  }
  const dataResolved = data ?? (isAppDataWarm() ? getData() : null);
  if (dataResolved) {
    const fromData = cnpjFromAppData(user, dataResolved);
    if (fromData.length === 14) return fromData;
  }
  return "";
}
