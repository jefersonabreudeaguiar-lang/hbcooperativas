import type { User } from "@/types";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { resolveHbCreditLimiteSyncTargets } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

/**
 * Pipeline HB Créditos cooperado (produção) — mesmo fluxo do aparelho Jeferson:
 * sync-limite na nuvem a partir da ficha → GET /api/credit/account → cache local (mobile).
 */
export async function executarCooperadoHbCreditSyncPadrao(
  user: Omit<User, "password"> | null | undefined
): Promise<boolean> {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (!isCloudSessionActive()) return false;

  if (!isAppDataWarm()) {
    preloadAppData();
    await waitForAppDataWarm(12_000);
  }
  if (!isAppDataWarm()) return false;

  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data);
  if (!cooperativaId) return false;

  const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
  if (!cnpj) return false;

  const limite = resolveHbCreditLimiteSyncTargets(user, data, cooperativaId);
  if (limite) {
    await refreshContaCoopLimiteFromFicha({
      cnpj,
      cooperadoId: limite.apiCooperadoId,
      cooperativaId,
      cooperadoIds: limite.cooperadoIds,
    }).catch(() => {});
  }

  const ok = await persistirHbCreditAccountCooperado(user, { syncLimiteFromFicha: false });
  if (ok) notifyHbCreditAccountCacheUpdated();
  return ok;
}

/** Agenda o pipeline padrão (idle) — login, início, pós-sync operacional. */
export function scheduleCooperadoHbCreditSyncPadrao(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return;
  const run = () => {
    void executarCooperadoHbCreditSyncPadrao(user);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_500 });
  } else {
    window.setTimeout(run, 400);
  }
}
