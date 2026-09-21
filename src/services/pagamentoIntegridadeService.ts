import type { AppData, FichaCorrida, PagamentoCooperadoRegistro } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import {
  fichaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { getMesesReferenciaPagamento } from "@/services/notaPedidoService";

function pagamentoCobreMes(p: PagamentoCooperadoRegistro, mesReferencia: string): boolean {
  if (p.mesesReferencia?.length) return p.mesesReferencia.includes(mesReferencia);
  return p.mesReferencia === mesReferencia;
}

function fichaPertenceCooperadoSafe(
  data: AppData,
  f: FichaCorrida,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  if (!data.cooperados?.length) {
    const coopId = cooperativaId ?? f.cooperativaId;
    return (
      f.cooperadoId === cooperadoId && (!coopId || !f.cooperativaId || f.cooperativaId === coopId)
    );
  }
  return fichaPertenceCooperado(data, f, cooperadoId, cooperativaId);
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
      fichaPertenceCooperadoSafe(data, f, canonico, coopId) &&
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

/** Com pagamento registrado, ficha do mês fica paga e pendente duplicada da mesma nota some. */
export function alinharFichaComPagamentosCooperativa(data: AppData): AppData {
  const now = new Date().toISOString();
  let fichaCorrida = [...(data.fichaCorrida ?? [])];
  let changed = false;

  for (const p of data.pagamentosCooperado ?? []) {
    if (p.status !== "aguardando_confirmacao" && p.status !== "confirmado") continue;
    const meses = getMesesReferenciaPagamento(p);
    const coopId = p.cooperativaId;
    const canonico = data.cooperados?.length
      ? resolverCooperadoIdCanonico(data, p.cooperadoId, coopId)
      : p.cooperadoId;

    for (const fid of p.fichaIds ?? []) {
      fichaCorrida = fichaCorrida.map((f) => {
        if (f.id !== fid || f.status === "pago") return f;
        changed = true;
        return { ...f, status: "pago" as const, updatedAt: now };
      });
    }

    for (const mes of meses) {
      fichaCorrida = fichaCorrida.map((f) => {
        if (!fichaPertenceCooperadoSafe(data, f, canonico, coopId) || f.mesReferencia !== mes) return f;
        if (f.status === "pago") return f;
        changed = true;
        return { ...f, status: "pago" as const, updatedAt: now };
      });
    }

    const notaIdsComPago = new Set(
      fichaCorrida
        .filter(
          (f) =>
            f.status === "pago" &&
            fichaPertenceCooperadoSafe(data, f, canonico, coopId) &&
            meses.includes(f.mesReferencia)
        )
        .map((f) => f.notaPedidoId)
    );
    if (notaIdsComPago.size) {
      const filtered = fichaCorrida.filter((f) => {
        if (f.status !== "pendente") return true;
        if (!fichaPertenceCooperadoSafe(data, f, canonico, coopId)) return true;
        if (!meses.includes(f.mesReferencia)) return true;
        if (!notaIdsComPago.has(f.notaPedidoId)) return true;
        changed = true;
        return false;
      });
      fichaCorrida = filtered;
    }
  }

  if (!changed) return data;
  return { ...data, fichaCorrida };
}

/** Reparo + alinhamento — evita voltar para pendente após PIX/assinatura. */
export function posProcessarIntegridadePagamentosCooperativa(data: AppData): AppData {
  return alinharFichaComPagamentosCooperativa(repararIntegridadePagamentosCooperativa(data));
}

function marcarFichasOperacionalPagamento(
  fichaCorrida: FichaCorrida[],
  pagamento: PagamentoCooperadoRegistro
): FichaCorrida[] {
  const now = new Date().toISOString();
  const meses = getMesesReferenciaPagamento(pagamento);
  const coopId = pagamento.cooperativaId;
  const canonico = pagamento.cooperadoId;
  const ids = new Set(pagamento.fichaIds ?? []);

  let next = fichaCorrida.map((f) => {
    const mesOk = meses.includes(f.mesReferencia);
    const coopOk = f.cooperativaId === coopId && (f.cooperadoId === canonico || ids.has(f.id));
    if (!mesOk || !coopOk || f.status === "pago") return f;
    return { ...f, status: "pago" as const, updatedAt: now };
  });

  const notaIdsComPago = new Set(
    next
      .filter(
        (f) =>
          f.status === "pago" &&
          f.cooperativaId === coopId &&
          f.cooperadoId === canonico &&
          meses.includes(f.mesReferencia)
      )
      .map((f) => f.notaPedidoId)
  );

  if (!notaIdsComPago.size) return next;

  return next.filter((f) => {
    if (f.status !== "pendente") return true;
    if (f.cooperativaId !== coopId || f.cooperadoId !== canonico) return true;
    if (!meses.includes(f.mesReferencia)) return true;
    return !notaIdsComPago.has(f.notaPedidoId);
  });
}

/** Publica confirmação do cooperado no operacional.json (servidor). */
export function aplicarPagamentoConfirmadoNoOperacional(
  operacional: OperacionalSyncPayload,
  pagamentoConfirmado: PagamentoCooperadoRegistro
): OperacionalSyncPayload {
  if (pagamentoConfirmado.status !== "confirmado") return operacional;
  const map = new Map<string, PagamentoCooperadoRegistro>();
  for (const p of operacional.pagamentosCooperado ?? []) map.set(p.id, p);
  const prev = map.get(pagamentoConfirmado.id);
  if (prev?.status === "confirmado" && prev.reciboHtml && !pagamentoConfirmado.reciboHtml) {
    return operacional;
  }
  map.set(pagamentoConfirmado.id, pagamentoConfirmado);
  const fichaCorrida = marcarFichasOperacionalPagamento(
    operacional.fichaCorrida ?? [],
    pagamentoConfirmado
  );
  return {
    ...operacional,
    pagamentosCooperado: [...map.values()],
    fichaCorrida,
    updatedAt: new Date().toISOString(),
  };
}
