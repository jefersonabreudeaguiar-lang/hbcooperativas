import type { AppData, FichaCorrida } from "@/types";
import { fichaPertenceCooperado } from "@/services/cooperadoCloudService";

const SYNC_COMPLETO_RATIO = 0.75;

function notaExcluidaLocal(data: AppData, notaId: string, cooperativaId?: string): boolean {
  return (data.notasPedidoExcluidas ?? []).some(
    (e) => e.id === notaId && (!cooperativaId || e.cooperativaId === cooperativaId)
  );
}

function fichasDaCooperativa(data: AppData, cooperativaId: string, cooperadoId?: string): FichaCorrida[] {
  return (data.fichaCorrida ?? []).filter((f) => {
    if (f.cooperativaId !== cooperativaId) return false;
    if (!cooperadoId) return true;
    return fichaPertenceCooperado(data, f, cooperadoId, cooperativaId);
  });
}

/** Indica se a maior parte das fichas locais já tem nota correspondente (sync de notas concluído). */
export function notasSyncProvavelmenteCompleto(data: AppData, cooperativaId: string): boolean {
  const fichasCoop = fichasDaCooperativa(data, cooperativaId);
  if (fichasCoop.length === 0) return true;
  const notaIds = new Set((data.notasPedido ?? []).map((n) => n.id));
  const comNota = fichasCoop.filter((f) => notaIds.has(f.notaPedidoId)).length;
  return comNota / fichasCoop.length >= SYNC_COMPLETO_RATIO;
}

/**
 * Mantém ficha sem nota local enquanto o sync de notas parece incompleto.
 * Evita apagar ficha recém-puxada da nuvem antes das notas chegarem (celular pós-login).
 */
export function fichaPreservarSemNotaLocal(data: AppData, ficha: FichaCorrida): boolean {
  if (notaExcluidaLocal(data, ficha.notaPedidoId, ficha.cooperativaId)) return false;
  return !notasSyncProvavelmenteCompleto(data, ficha.cooperativaId ?? "");
}

/** Fichas locais que referenciam notas ainda não baixadas neste aparelho. */
export function contarFichasOrfasAguardandoNotas(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string
): number {
  const notaIds = new Set((data.notasPedido ?? []).map((n) => n.id));
  return fichasDaCooperativa(data, cooperativaId, cooperadoId).filter(
    (f) => !notaIds.has(f.notaPedidoId) && !notaExcluidaLocal(data, f.notaPedidoId, cooperativaId)
  ).length;
}

/**
 * Delta de notas vazio + ficha sem nota local = cursor/sync incompleto.
 * Dispara novo full sync de notas para qualquer cooperado.
 */
export function precisaReparoFullSyncNotas(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string
): boolean {
  if (notasSyncProvavelmenteCompleto(data, cooperativaId)) return false;
  const orfas = contarFichasOrfasAguardandoNotas(data, cooperativaId, cooperadoId);
  if (orfas === 0) return false;

  const conferidas = (data.notasPedido ?? []).filter(
    (n) => n.status === "conferida" || n.status === "pago"
  ).length;
  if (conferidas === 0) return true;

  const fichasTotal = fichasDaCooperativa(data, cooperativaId, cooperadoId).length;
  return orfas >= Math.max(1, Math.ceil(fichasTotal * 0.25));
}

/** Bloqueia push operacional que apagaria ficha na nuvem por snapshot local incompleto. */
export function operacionalPushSeguro(
  data: AppData,
  cooperativaId: string,
  cloudFichaCount: number,
  localFichaCount: number
): boolean {
  if (cloudFichaCount < 3) return true;
  if (localFichaCount >= Math.floor(cloudFichaCount * 0.5)) return true;
  if (notasSyncProvavelmenteCompleto(data, cooperativaId)) return true;
  return false;
}
