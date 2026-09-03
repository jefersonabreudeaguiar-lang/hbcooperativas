import type { AppData, FichaCorrida } from "@/types";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { getCurrentMesReferencia } from "@/utils/format";

const SYNC_COMPLETO_RATIO = 0.75;

function notasConferidasCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  return (data.notasPedido ?? []).filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      notaPertenceCooperado(data, n, cooperadoId, cooperativaId)
  ).length;
}

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

/** Indica se a maior parte das fichas locais já tem nota conferida/paga (sync de notas concluído). */
export function notasSyncProvavelmenteCompleto(data: AppData, cooperativaId: string): boolean {
  const fichasCoop = fichasDaCooperativa(data, cooperativaId);
  if (fichasCoop.length === 0) {
    // Vazio local ≠ sync ok — evita delta vazio eterno após relogin no celular.
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

/** Cooperado sem dados financeiros locais completos (precisa puxar/reparar da nuvem). */
export function cooperadoFinanceiroLocalAusente(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const fichasPendentes = fichasDaCooperativa(data, cooperativaId, canonico).filter(
    (f) => f.status === "pendente"
  );
  const conferidas = notasConferidasCooperado(data, canonico, cooperativaId);

  // Sem ficha e sem entrega conferida = cooperado novo ou só com rascunho — estado válido.
  if (fichasPendentes.length === 0 && conferidas === 0) return false;

  // Ficha veio da nuvem antes das notas conferidas — estado quebrado típico no celular.
  if (fichasPendentes.length > 0 && conferidas === 0) return true;

  if (conferidas > 0) {
    const fichasElegiveis = fichasPendentes.filter((f) => {
      const nota = (data.notasPedido ?? []).find((n) => n.id === f.notaPedidoId);
      return nota && (nota.status === "conferida" || nota.status === "pago");
    }).length;
    if (fichasElegiveis === 0) return true;
  }

  return false;
}

function mesReferenciaAnterior(mesReferencia: string): string {
  const [y, m] = mesReferencia.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Cooperado ativo cujo último mês local é o mês anterior ao calendário —
 * típico quando agosto baixou mas setembro (notas + ficha) ainda não sincronizou.
 */
export function cooperadoPrecisaFullSyncFinanceiro(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const mesAtual = getCurrentMesReferencia();
  const mesAnterior = mesReferenciaAnterior(mesAtual);

  const conferidas = (data.notasPedido ?? []).filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      notaPertenceCooperado(data, n, canonico, cooperativaId)
  );
  if (conferidas.length === 0) return false;

  const maxMesNota = conferidas.reduce(
    (max, n) => (n.mesReferencia > max ? n.mesReferencia : max),
    ""
  );
  const fichasPendentes = fichasDaCooperativa(data, cooperativaId, canonico).filter(
    (f) => f.status === "pendente"
  );
  const maxMesFicha = fichasPendentes.reduce(
    (max, f) => (f.mesReferencia > max ? f.mesReferencia : max),
    ""
  );
  const maxMesLocal = maxMesNota > maxMesFicha ? maxMesNota : maxMesFicha;
  if (maxMesLocal !== mesAnterior) return false;

  const teveAtividade =
    conferidas.some((n) => n.mesReferencia === maxMesLocal) ||
    fichasPendentes.some((f) => f.mesReferencia === maxMesLocal);
  return teveAtividade;
}

/** Ficha/notas ausentes ou valor a receber possivelmente incompleto (sync parcial). */
export function cooperadoFinanceiroDesatualizado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  return (
    cooperadoFinanceiroLocalAusente(data, cooperadoId, cooperativaId) ||
    cooperadoPrecisaFullSyncFinanceiro(data, cooperadoId, cooperativaId)
  );
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
  if (
    cooperadoId &&
    (cooperadoFinanceiroLocalAusente(data, cooperadoId, cooperativaId) ||
      cooperadoPrecisaFullSyncFinanceiro(data, cooperadoId, cooperativaId))
  ) {
    return true;
  }
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
