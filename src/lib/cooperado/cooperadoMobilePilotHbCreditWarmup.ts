import type { User } from "@/types";
import { isCooperadoMobilePilotHbCreditUi } from "@/lib/cooperado/cooperadoMobilePilotHbCredit";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

/** Prefetch de rotas HB — chamado no Início cooperado (piloto). */
export function scheduleCooperadoPilotHbCreditRouteWarmup(
  user: Omit<User, "password"> | null | undefined,
  prefetch: (href: string) => void
): void {
  if (!isCooperadoMobilePilotHbCreditUi(user)) return;
  const routes = ["/minha-conta-coop", "/minha-conta-coop/escanear"];
  const run = () => {
    for (const href of routes) {
      try {
        prefetch(href);
      } catch {
        /* ignore */
      }
    }
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 1_200 });
  } else {
    window.setTimeout(run, 300);
  }
}

/** Recalcula limite na nuvem (ficha/entregas) e grava cache da conta HB — cooperado mobile. */
export function scheduleCooperadoHbCreditLimiteAndAccountWarmup(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return;
  const run = () => {
    void (async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!isAppDataWarm() || !isCloudSessionActive()) return;
      const data = getData();
      const cooperativaId = getUserCooperativaId(user, data);
      if (!cooperativaId) return;
      const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
      if (!cnpj) return;
      const apiId = resolveHbCreditApiCooperadoId(user, user.cooperadoId);
      const canon = resolverCooperadoIdCanonico(data, apiId, cooperativaId);
      await refreshContaCoopLimiteFromFicha({
        cnpj,
        cooperadoId: canon,
        cooperativaId,
      }).catch(() => {});
      const ok = await persistirHbCreditAccountCooperado(user);
      if (ok) notifyHbCreditAccountCacheUpdated();
    })();
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_500 });
  } else {
    window.setTimeout(run, 400);
  }
}

/** Grava cache da conta HB em idle logo após login — abre Minha Conta na hora. */
export function scheduleCooperadoPilotHbCreditAccountPersist(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!isCooperadoMobilePilotHbCreditUi(user)) return;
  scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
}
