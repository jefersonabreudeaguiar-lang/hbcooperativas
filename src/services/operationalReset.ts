import type { AppData } from "@/types";

/** Incremente ao publicar uma limpeza global de lançamentos nos dispositivos. */
export const OPERATIONAL_RESET_VERSION = 5;

export const OPERATIONAL_RESET_STORAGE_KEY = "coopeagriplla_operational_reset_v";
export const OPERATIONAL_RESET_CLOUD_KEY = "coopeagriplla_operational_reset_cloud_v";

export function needsOperationalResetCloudPush(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(OPERATIONAL_RESET_CLOUD_KEY) === "pending";
}

export function markOperationalResetCloudPending(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OPERATIONAL_RESET_CLOUD_KEY, "pending");
}

export function markOperationalResetCloudDone(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OPERATIONAL_RESET_CLOUD_KEY);
}

/** Remove entregas, fichas, pagamentos e avisos; mantém mensalidades, cadastros e contratos. */
export function clearOperationalData(data: AppData): AppData {
  return {
    ...data,
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    cotas: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    comunicados: [],
    auditLog: [],
  };
}

export function applyOperationalResetIfNeeded(data: AppData): { data: AppData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };

  const stored = localStorage.getItem(OPERATIONAL_RESET_STORAGE_KEY);
  if (stored === String(OPERATIONAL_RESET_VERSION)) return { data, changed: false };

  localStorage.setItem(OPERATIONAL_RESET_STORAGE_KEY, String(OPERATIONAL_RESET_VERSION));
  markOperationalResetCloudPending();
  return { data: clearOperationalData(data), changed: true };
}
