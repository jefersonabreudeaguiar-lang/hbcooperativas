import type { AppData } from "@/types";

/** Incremente ao publicar uma limpeza global de lançamentos nos dispositivos. */
export const OPERATIONAL_RESET_VERSION = 1;

export const OPERATIONAL_RESET_STORAGE_KEY = "coopeagriplla_operational_reset_v";

/** Remove entregas, fichas, pagamentos e demais lançamentos; mantém cadastros e contratos. */
export function clearOperationalData(data: AppData): AppData {
  return {
    ...data,
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    mensalidades: [],
    cotas: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    fechamentos: [],
    auditLog: [],
  };
}

export function applyOperationalResetIfNeeded(data: AppData): { data: AppData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };

  const stored = localStorage.getItem(OPERATIONAL_RESET_STORAGE_KEY);
  if (stored === String(OPERATIONAL_RESET_VERSION)) return { data, changed: false };

  localStorage.setItem(OPERATIONAL_RESET_STORAGE_KEY, String(OPERATIONAL_RESET_VERSION));
  return { data: clearOperationalData(data), changed: true };
}
