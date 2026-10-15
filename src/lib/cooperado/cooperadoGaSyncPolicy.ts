import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoPostDeployQueueActive } from "@/lib/cooperado/cooperadoPostDeploySession";
import { isPwaColdStartWindow } from "@/lib/pwa/clientRelease";
import { getSession } from "@/services/dataStore";

const PRIMEIRA_CARGA_KEY = "hb-cooperado-primeira-carga-pending";
const FINANCE_EXIBICAO_SYNC_KEY = "hb-cooperado-ga-finance-exibicao-sync-pending";

/** Uma operacional_full silenciosa GA quando a UI financeira está zerada sem prova local. */
export function markCooperadoGaFinanceExibicaoSyncPending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(FINANCE_EXIBICAO_SYNC_KEY, "1");
  } catch {
    /* quota */
  }
}

export function cooperadoGaTemFinanceExibicaoSyncPending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(FINANCE_EXIBICAO_SYNC_KEY) === "1";
  } catch {
    return false;
  }
}

export function consumeCooperadoGaFinanceExibicaoSyncPending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(FINANCE_EXIBICAO_SYNC_KEY);
  } catch {
    /* quota */
  }
}

/** Cooperado sem fatia financeira local — permite um operacional_full automático na sessão. */
export function markCooperadoPrimeiraCargaSyncPending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PRIMEIRA_CARGA_KEY, "1");
  } catch {
    /* quota */
  }
}

export function cooperadoGaTemPrimeiraCargaSyncPending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(PRIMEIRA_CARGA_KEY) === "1";
  } catch {
    return false;
  }
}

export function consumeCooperadoPrimeiraCargaSyncPending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PRIMEIRA_CARGA_KEY);
  } catch {
    /* quota */
  }
}

/**
 * Produção cooperado (GA): operacional_full só com «Atualizar» ou primeira carga explícita.
 * Evita travar o celular com sync completo na abertura / após deploy.
 */
export function cooperadoGaBloqueiaOperacionalFullAutomatico(opts?: {
  userInitiated?: boolean;
  eventDriven?: boolean;
}): boolean {
  if (cooperadoPostDeployQueueActive()) return false;
  if (opts?.userInitiated) return false;
  const session = getSession();
  if (!session || session.role !== "cooperado" || !isCooperadoMobileGaPromoted(session)) {
    return false;
  }
  if (cooperadoGaTemPrimeiraCargaSyncPending()) return false;
  if (opts?.eventDriven && cooperadoGaTemFinanceExibicaoSyncPending()) return false;
  return true;
}

export function cooperadoGaDeferForegroundRevisionChecks(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  return isPwaColdStartWindow();
}
