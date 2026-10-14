import type { User } from "@/types";
import { isCooperadoMobilePilotHbCreditUi } from "@/lib/cooperado/cooperadoMobilePilotHbCredit";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";

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

/** Grava cache da conta HB em idle logo após login — abre Minha Conta na hora. */
export function scheduleCooperadoPilotHbCreditAccountPersist(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!isCooperadoMobilePilotHbCreditUi(user)) return;
  const run = () => {
    void persistirHbCreditAccountCooperado(user).then((ok) => {
      if (ok) notifyHbCreditAccountCacheUpdated();
    });
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 800 });
  } else {
    window.setTimeout(run, 200);
  }
}
