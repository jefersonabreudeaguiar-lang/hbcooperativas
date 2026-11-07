import type { AppData } from "@/types";

export function marcarPublicacaoPendente(data: AppData, coopId: string, token: string, id?: string): AppData {
  const anterior = data.comunicadosPublicacaoPendente?.[coopId];
  return { ...data, comunicadosPublicacaoPendente: {
    ...data.comunicadosPublicacaoPendente,
    [coopId]: { token, ids: [...new Set([...anterior?.ids ?? [], ...id ? [id] : []])] },
  } };
}

export function confirmarPublicacaoPendente(data: AppData, coopId: string, token?: string): AppData {
  if (!token || data.comunicadosPublicacaoPendente?.[coopId]?.token !== token) return data;
  const pendentes = { ...data.comunicadosPublicacaoPendente };
  delete pendentes[coopId];
  return { ...data, comunicadosPublicacaoPendente: pendentes };
}
