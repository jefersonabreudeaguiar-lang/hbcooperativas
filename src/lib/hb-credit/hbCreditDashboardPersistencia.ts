/**
 * Cache local do painel HB Créditos (responsável / tesoureiro).
 */
import type { ContaCoopDashboard } from "@/modules/hb-credit/types";

export const HB_CREDIT_DASHBOARD_STORAGE_VERSION = 1;

export type HbCreditDashboardPersistido = {
  v: number;
  dashboard: ContaCoopDashboard;
  savedAt: string;
};

export function hbCreditDashboardStorageKey(cnpj: string): string {
  return `hb.coop.hbCreditDashboard.v${HB_CREDIT_DASHBOARD_STORAGE_VERSION}:${cnpj}`;
}

export function lerHbCreditDashboardPersistido(cnpj: string): HbCreditDashboardPersistido | null {
  if (typeof localStorage === "undefined" || !cnpj) return null;
  try {
    const raw = localStorage.getItem(hbCreditDashboardStorageKey(cnpj));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HbCreditDashboardPersistido;
    if (parsed.v !== HB_CREDIT_DASHBOARD_STORAGE_VERSION || !parsed.dashboard) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarHbCreditDashboardPersistido(
  cnpj: string,
  dashboard: ContaCoopDashboard
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: HbCreditDashboardPersistido = {
      v: HB_CREDIT_DASHBOARD_STORAGE_VERSION,
      dashboard,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(hbCreditDashboardStorageKey(cnpj), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
