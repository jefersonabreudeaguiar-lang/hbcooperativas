/**
 * Pré-carrega conta HB na nuvem → localStorage (cooperado), sem abrir a aba.
 * GET da conta liberada não espera AppData: CNPJ vem da sessão, do cache HB ou do AppData se já estiver quente.
 */
import {
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { resolveCooperadoHbCreditCnpjDigits } from "@/lib/hb-credit/resolveCooperadoHbCreditCnpj";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { fetchCreditAccount } from "@/services/creditApiService";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import {
  coalesceContaCoopAuxSync,
  contaCoopAuxSyncKeyAccountPersist,
} from "@/lib/hb-credit/contaCoopAuxSyncDedupe";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import type { User } from "@/types";

async function resolverCnpjHbCreditGet(user: Omit<User, "password">): Promise<string> {
  const imediato = resolveCooperadoHbCreditCnpjDigits(user);
  if (imediato.length === 14) return imediato;
  if (!isAppDataWarm()) {
    preloadAppData();
    await waitForAppDataWarm(10_000);
  }
  if (!isAppDataWarm()) return resolveCooperadoHbCreditCnpjDigits(user);
  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  const fromResolve = cooperativaId
    ? await resolveCooperativaCnpj(data, cooperativaId, user)
    : "";
  if (fromResolve && fromResolve.length === 14) return fromResolve;
  return resolveCooperadoHbCreditCnpjDigits(user, data);
}

export async function persistirHbCreditAccountCooperado(
  user: Omit<User, "password"> | null | undefined,
  options?: { syncLimiteFromFicha?: boolean }
): Promise<boolean> {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  const cooperadoId = user.cooperadoId;
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  if (!isCloudSessionActive()) return false;

  const cnpj = await resolverCnpjHbCreditGet(user);
  if (cnpj.length !== 14) return false;

  const apiCooperadoId = resolveHbCreditApiCooperadoId(user, cooperadoId);
  const syncLimite = options?.syncLimiteFromFicha === true;
  const dedupeKey = contaCoopAuxSyncKeyAccountPersist(cnpj, apiCooperadoId);

  return coalesceContaCoopAuxSync(dedupeKey, async () => {
    try {
      if (syncLimite && isAppDataWarm()) {
        const data = getData();
        const cooperativaId = getUserCooperativaId(user, data) ?? user.cooperativaId;
        if (cooperativaId) {
          const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
          const cooperadoIds =
            canonico && canonico !== apiCooperadoId ? [apiCooperadoId, canonico] : [apiCooperadoId];
          await refreshContaCoopLimiteFromFicha({
            cnpj,
            cooperadoId: apiCooperadoId,
            cooperativaId,
            cooperadoIds,
          }).catch(() => {});
        }
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
      return Boolean(acc.account);
    } catch {
      return false;
    }
  });
}
