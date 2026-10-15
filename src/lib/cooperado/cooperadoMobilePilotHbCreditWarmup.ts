import type { User } from "@/types";
import { scheduleCooperadoHbCreditSyncPadrao } from "@/lib/cooperado/cooperadoHbCreditSyncPadrao";

/** Prefetch de rotas HB — chamado no Início cooperado (piloto). */
export function scheduleCooperadoPilotHbCreditRouteWarmup(
  user: Omit<User, "password"> | null | undefined,
  prefetch: (href: string) => void
): void {
  if (!user || user.role !== "cooperado") return;
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

/** @deprecated Use scheduleCooperadoHbCreditSyncPadrao — mantido para imports existentes. */
export const scheduleCooperadoHbCreditLimiteAndAccountWarmup = scheduleCooperadoHbCreditSyncPadrao;

/** Grava cache da conta HB em idle logo após login — todos os cooperados. */
export function scheduleCooperadoPilotHbCreditAccountPersist(
  user: Omit<User, "password"> | null | undefined
): void {
  scheduleCooperadoHbCreditSyncPadrao(user);
}
