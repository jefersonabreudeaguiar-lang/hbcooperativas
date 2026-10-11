/**
 * Guardas de sync notas↔ficha — módulo folha (notaPedidoService importa daqui, não de fichaSyncGuard).
 */
import type { AppData, FichaCorrida } from "@/types";

const SYNC_COMPLETO_RATIO = 0.75;

function fichasDaCooperativa(data: AppData, cooperativaId: string): FichaCorrida[] {
  return (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === cooperativaId);
}

function notaExcluidaLocal(data: AppData, notaId: string, cooperativaId?: string): boolean {
  return (data.notasPedidoExcluidas ?? []).some(
    (e) => e.id === notaId && (!cooperativaId || e.cooperativaId === cooperativaId)
  );
}

/** Indica se a maior parte das fichas locais já tem nota conferida/paga (sync de notas concluído). */
export function notasSyncProvavelmenteCompleto(data: AppData, cooperativaId: string): boolean {
  const fichasCoop = fichasDaCooperativa(data, cooperativaId);
  if (fichasCoop.length === 0) {
    return false;
  }
  const notasElegiveis = new Set(
    (data.notasPedido ?? [])
      .filter((n) => n.status === "conferida" || n.status === "pago")
      .map((n) => n.id)
  );
  const comNotaConferida = fichasCoop.filter((f) => notasElegiveis.has(f.notaPedidoId)).length;
  return comNotaConferida / fichasCoop.length >= SYNC_COMPLETO_RATIO;
}

/**
 * Mantém ficha sem nota local enquanto o sync de notas parece incompleto.
 */
export function fichaPreservarSemNotaLocal(data: AppData, ficha: FichaCorrida): boolean {
  if (notaExcluidaLocal(data, ficha.notaPedidoId, ficha.cooperativaId)) return false;
  return !notasSyncProvavelmenteCompleto(data, ficha.cooperativaId ?? "");
}
