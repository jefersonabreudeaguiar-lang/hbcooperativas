import type { AppData, PagamentoCooperadoRegistro } from "@/types";
import {
  fichaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";

function pagamentoCobreMes(p: PagamentoCooperadoRegistro, mesReferencia: string): boolean {
  if (p.mesesReferencia?.length) return p.mesesReferencia.includes(mesReferencia);
  return p.mesReferencia === mesReferencia;
}

function pagamentoPertenceCooperado(
  data: AppData,
  p: PagamentoCooperadoRegistro,
  cooperadoId: string,
  coopId?: string
): boolean {
  if (!data.cooperados?.length) {
    return p.cooperadoId === cooperadoId;
  }
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId ?? p.cooperativaId);
  const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, coopId ?? p.cooperativaId);
  return p.cooperadoId === cooperadoId || p.cooperadoId === canonico || pCanon === canonico;
}

/** Mês com pagamento registrado pela cooperativa (aguardando ou confirmado). */
export function cooperadoMesTemPagamentoRegistrado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  const coopId = data.cooperados?.find((c) => c.id === cooperadoId)?.cooperativaId;
  return (data.pagamentosCooperado ?? []).some(
    (p) =>
      pagamentoPertenceCooperado(data, p, cooperadoId, coopId) &&
      (p.status === "aguardando_confirmacao" || p.status === "confirmado") &&
      pagamentoCobreMes(p, mesReferencia)
  );
}

/** Ficha marcada paga sem PIX/registro — cooperado some da fila Pagar até reparar. */
export function cooperadoMesComFichaPagaSemPagamentoCooperativa(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): boolean {
  const coopId = cooperativaId ?? data.cooperados?.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = data.cooperados?.length
    ? resolverCooperadoIdCanonico(data, cooperadoId, coopId)
    : cooperadoId;
  return (data.fichaCorrida ?? []).some(
    (f) =>
      fichaPertenceCooperado(data, f, canonico, coopId) &&
      f.mesReferencia === mesReferencia &&
      f.status === "pago" &&
      !cooperadoMesTemPagamentoRegistrado(data, cooperadoId, mesReferencia)
  );
}

/**
 * Ficha/nota marcada como paga sem registro em pagamentosCooperado (ex.: sync incompleto) volta a pendente/conferida.
 */
export function repararIntegridadePagamentosCooperativa(data: AppData): AppData {
  const now = new Date().toISOString();
  let changed = false;

  const fichaCorrida = (data.fichaCorrida ?? []).map((f) => {
    if (f.status !== "pago") return f;
    if (cooperadoMesTemPagamentoRegistrado(data, f.cooperadoId, f.mesReferencia)) return f;
    changed = true;
    return { ...f, status: "pendente" as const, updatedAt: now };
  });

  const notasPedido = (data.notasPedido ?? []).map((n) => {
    if (n.status !== "pago") return n;
    const fichasNota = fichaCorrida.filter((f) => f.notaPedidoId === n.id);
    if (fichasNota.some((f) => f.status === "pago")) return n;
    if (cooperadoMesTemPagamentoRegistrado(data, n.cooperadoId, n.mesReferencia)) return n;
    changed = true;
    return { ...n, status: "conferida" as const, updatedAt: now };
  });

  if (!changed) return data;
  return { ...data, fichaCorrida, notasPedido };
}
