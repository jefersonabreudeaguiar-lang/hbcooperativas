/**
 * Cooperado mobile + BIC: mesma precisão de exibição, menos parse/sync e menos re-render global.
 * — 1ª sessão: pull operacional completo; reforços: só nuvem se revisão mudou.
 * — Rematerialização BIC em idle; AppData eager adiado como no staff.
 */
import type { User } from "@/types";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";

/** Domínios que afetam card início / snapshots BIC (ignora notas puras no keep-alive). */
export const COOPERADO_BIC_HYBRID_FINANCE_DOMAINS: readonly AppDataNotifyDomain[] = [
  "shell",
  "financeiro",
];

export function isCooperadoBicHybridLightEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = (env.NEXT_PUBLIC_COOPERADO_BIC_HYBRID_LIGHT ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no";
}

export function cooperadoBicHybridLightUiActive(
  user: Omit<User, "password"> | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isCooperadoBicHybridLightEnabled(env) && isCooperadoMobileBicLeituraAuthority(user, env);
}

export function shouldDeferAppDataEagerWarmForCooperadoBicHybrid(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return cooperadoBicHybridLightUiActive(user);
}

/** Tarefa não urgente após sync BIC (snapshots / eventos PWA leve). */
export function scheduleCooperadoBicHybridIdleTask(run: () => void, timeoutMs = 900): void {
  if (typeof window === "undefined") {
    run();
    return;
  }
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: timeoutMs });
    return;
  }
  window.setTimeout(run, 0);
}
