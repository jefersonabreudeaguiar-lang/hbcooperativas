import type { AppData, PagamentoCooperadoRegistro } from "@/types";

function pagamentoCobreMes(p: PagamentoCooperadoRegistro, mesReferencia: string): boolean {
  if (p.mesesReferencia?.length) return p.mesesReferencia.includes(mesReferencia);
  return p.mesReferencia === mesReferencia;
}

/** Mês com pagamento registrado pela cooperativa (aguardando ou confirmado). */
export function cooperadoMesTemPagamentoRegistrado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  return (data.pagamentosCooperado ?? []).some(
    (p) =>
      p.cooperadoId === cooperadoId &&
      (p.status === "aguardando_confirmacao" || p.status === "confirmado") &&
      pagamentoCobreMes(p, mesReferencia)
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
