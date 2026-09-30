/**
 * Pré-carrega conta HB na nuvem → localStorage (cooperado), sem abrir a aba.
 */
import {
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { fetchCreditAccount } from "@/services/creditApiService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { notifyHbCreditLimiteSynced } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import type { User } from "@/types";

export async function persistirHbCreditAccountCooperado(
  user: Omit<User, "password"> | null | undefined
): Promise<boolean> {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (!isAppDataWarm() || typeof navigator === "undefined" || !navigator.onLine) return false;
  if (!isCloudSessionActive()) return false;

  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data);
  if (!cooperativaId) return false;

  const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
  if (!cnpj) return false;

  const cooperadoId = user.cooperadoId;
  try {
    const acc = await fetchCreditAccount(cnpj, cooperadoId);
    gravarHbCreditAccountPersistido(cnpj, cooperadoId, {
      v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
      account: (acc.account as import("@/modules/hb-credit/types").ContaCoopLimiteCooperado) ?? null,
      updatedAt: acc.updatedAt ?? null,
      hasPin: Boolean(acc.hasPin),
      pinResetPending: Boolean(acc.pinResetPending),
      savedAt: new Date().toISOString(),
    });
    notifyHbCreditLimiteSynced();
    return Boolean(acc.account);
  } catch {
    return false;
  }
}
