/**
 * Pré-carrega conta HB na nuvem → localStorage (cooperado), sem abrir a aba.
 */
import {
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { fetchCreditAccount } from "@/services/creditApiService";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { notifyHbCreditAccountCacheUpdated, notifyHbCreditLimiteSynced } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import type { User } from "@/types";

export async function persistirHbCreditAccountCooperado(
  user: Omit<User, "password"> | null | undefined,
  options?: { syncLimiteFromFicha?: boolean }
): Promise<boolean> {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  if (!isCloudSessionActive()) return false;

  if (!isAppDataWarm()) {
    preloadAppData();
    await waitForAppDataWarm(10_000);
  }
  if (!isAppDataWarm()) {
    const cnpjSession = user.cooperativaCnpj ? normalizeCnpj(user.cooperativaCnpj) : "";
    if (cnpjSession.length !== 14 || !user.cooperativaId) return false;
  }

  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!cooperativaId) return false;

  const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
  if (!cnpj) return false;

  const apiCooperadoId = resolveHbCreditApiCooperadoId(user, user.cooperadoId);
  const canonico = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  const cooperadoIds =
    canonico && canonico !== apiCooperadoId ? [apiCooperadoId, canonico] : [apiCooperadoId];
  const syncLimite = options?.syncLimiteFromFicha !== false;
  try {
    if (syncLimite) {
      await refreshContaCoopLimiteFromFicha({
        cnpj,
        cooperadoId: apiCooperadoId,
        cooperativaId,
        cooperadoIds,
      }).catch(() => {});
    }
    const acc = await fetchCreditAccount(cnpj, apiCooperadoId);
    gravarHbCreditAccountPersistido(cnpj, apiCooperadoId, {
      v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
      account: (acc.account as import("@/modules/hb-credit/types").ContaCoopLimiteCooperado) ?? null,
      updatedAt: acc.updatedAt ?? null,
      hasPin: Boolean(acc.hasPin),
      pinResetPending: Boolean(acc.pinResetPending),
      savedAt: new Date().toISOString(),
    });
    notifyHbCreditAccountCacheUpdated();
    notifyHbCreditLimiteSynced();
    return Boolean(acc.account);
  } catch {
    return false;
  }
}
