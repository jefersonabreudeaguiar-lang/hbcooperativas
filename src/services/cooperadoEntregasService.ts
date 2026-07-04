import type { AppData, NotaPedido, PagamentoCooperadoRegistro } from "@/types";
import { notaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  getPagamentoAguardandoCooperado,
  getResumoPagamentoExibicao,
  getTotalAPagarCooperado,
  getResumoPagamentoCooperado,
} from "@/services/notaPedidoService";
import { getCurrentMesReferencia } from "@/utils/format";
import { mesesComValoresAvulsos, totalValoresAvulsosPendentes } from "@/services/valoresAvulsosReceberService";
import { contarEntregasNoMes } from "@/services/entregaCooperadoService";
import { contarFotosEnviadasNota } from "@/utils/fotoEntrega";

export interface ResumoMesEntregasCooperado {
  mesReferencia: string;
  notas: NotaPedido[];
  quantidadeEntregas: number;
  emAnalise: number;
  rejeitadas: number;
  conferidas: number;
  pagas: number;
  valorAReceber: number;
  valorRecebido: number;
  pagamentoConfirmado?: PagamentoCooperadoRegistro;
  pagamentoAguardando?: PagamentoCooperadoRegistro;
}

export function notaPendenteCooperado(status: NotaPedido["status"]): boolean {
  return status === "aguardando_conferencia" || status === "rejeitada";
}

export function listarNotasPendentesCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): NotaPedido[] {
  return notasDoCooperado(data, cooperadoId, cooperativaId).filter((n) =>
    notaPendenteCooperado(n.status)
  );
}

/** Valor a receber no início — oculta mês quitado ou sem valor pendente. */
export function cooperadoExibirValorReceberInicio(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): { exibir: boolean; mes: string; valor: number; aguardandoAssinatura: boolean } {
  const { mes, valor, aguardandoAssinatura } = getValorQuantoVouReceber(
    data,
    cooperadoId,
    cooperativaId
  );
  if (aguardandoAssinatura) {
    return { exibir: true, mes, valor, aguardandoAssinatura: true };
  }
  if (getPagamentoConfirmadoMes(data, cooperadoId, mes)) {
    return { exibir: false, mes, valor: 0, aguardandoAssinatura: false };
  }
  if (valor <= 0 || cooperadoMesQuitado(data, cooperadoId, mes)) {
    return { exibir: false, mes, valor: 0, aguardandoAssinatura: false };
  }
  return { exibir: true, mes, valor, aguardandoAssinatura: false };
}

export function filtrarResumosEntregasPendentes(
  resumos: ResumoMesEntregasCooperado[]
): ResumoMesEntregasCooperado[] {
  return resumos
    .map((r) => ({
      ...r,
      notas: r.notas.filter((n) => notaPendenteCooperado(n.status)),
    }))
    .filter((r) => r.notas.length > 0);
}

function notasDoCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): NotaPedido[] {
  return data.notasPedido
    .filter((n) => notaPertenceCooperado(data, n, cooperadoId, cooperativaId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function listarMesesEntregasCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const set = new Set(notasDoCooperado(data, cooperadoId, cooperativaId).map((n) => n.mesReferencia));
  for (const p of data.pagamentosCooperado) {
    if (p.cooperadoId === cooperadoId) set.add(p.mesReferencia);
  }
  for (const mes of mesesComValoresAvulsos(data, cooperadoId, cooperativaId)) {
    set.add(mes);
  }
  set.add(getCurrentMesReferencia());
  return [...set].sort((a, b) => b.localeCompare(a));
}

/** Ordem cronológica no mês — Entrega 1 = primeira do mês. */
export function ordenarNotasMesCronologico(notas: NotaPedido[]): NotaPedido[] {
  return [...notas].sort((a, b) => {
    const porData = a.dataEntrega.localeCompare(b.dataEntrega);
    if (porData !== 0) return porData;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function getPagamentoConfirmadoMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): PagamentoCooperadoRegistro | undefined {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return data.pagamentosCooperado.find(
    (p) =>
      (p.cooperadoId === cooperadoId ||
        p.cooperadoId === canonico ||
        resolverCooperadoIdCanonico(data, p.cooperadoId, coopId ?? p.cooperativaId) === canonico) &&
      p.mesReferencia === mesReferencia &&
      p.status === "confirmado"
  );
}

/** Mês já quitado — some de Início e Quanto vou receber. */
export function cooperadoMesQuitado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia)) return false;
  if (getTotalAPagarCooperado(data, cooperadoId, mesReferencia) > 0) return false;
  if (totalValoresAvulsosPendentes(data, cooperadoId, mesReferencia, coopId) > 0) return false;
  return !!getPagamentoConfirmadoMes(data, cooperadoId, mesReferencia);
}

/** Mês exibido em Quanto vou receber (pendente ou aguardando assinatura). */
export function getMesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string {
  const mesAtual = getCurrentMesReferencia();
  const meses = listarMesesEntregasCooperado(data, cooperadoId, cooperativaId);

  for (const mes of meses) {
    if (cooperadoMesQuitado(data, cooperadoId, mes)) continue;
    if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) return mes;
    if (getTotalAPagarCooperado(data, cooperadoId, mes) > 0) return mes;
    if (totalValoresAvulsosPendentes(data, cooperadoId, mes, cooperativaId) > 0) return mes;
  }

  return mesAtual;
}

/** Cooperado ainda sem pagamento registrado pelo responsável neste mês. */
export function cooperadoPendentePagamentoResponsavel(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): boolean {
  if (getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia)) return false;
  if (getPagamentoConfirmadoMes(data, cooperadoId, mesReferencia)) return false;
  return getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, cooperativaId).valorLiquido > 0;
}

export function cooperadoTemValorPendente(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  const mes = getMesQuantoVouReceber(data, cooperadoId, cooperativaId);
  if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) return true;
  if (getTotalAPagarCooperado(data, cooperadoId, mes) > 0 && !cooperadoMesQuitado(data, cooperadoId, mes)) {
    return true;
  }
  return totalValoresAvulsosPendentes(data, cooperadoId, undefined, cooperativaId) > 0;
}

export function getValorQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): { mes: string; valor: number; aguardandoAssinatura: boolean } {
  const mes = getMesQuantoVouReceber(data, cooperadoId, cooperativaId);
  const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId, mes);
  if (aguardando) {
    return { mes, valor: aguardando.valorLiquido, aguardandoAssinatura: true };
  }
  const resumo = getResumoPagamentoExibicao(data, cooperadoId, mes, cooperativaId);
  return { mes, valor: resumo.valorLiquido, aguardandoAssinatura: false };
}

export function getResumoMesEntregasCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado {
  const notas = ordenarNotasMesCronologico(
    notasDoCooperado(data, cooperadoId, cooperativaId).filter((n) => n.mesReferencia === mesReferencia)
  );
  const pagamentoConfirmado = getPagamentoConfirmadoMes(data, cooperadoId, mesReferencia);
  const pagamentoAguardando = getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia);
  const valorAReceber = getResumoPagamentoExibicao(
    data,
    cooperadoId,
    mesReferencia,
    cooperativaId
  ).valorLiquido;
  const valorRecebido = pagamentoConfirmado?.valorLiquido ?? 0;

  return {
    mesReferencia,
    notas,
    quantidadeEntregas: contarEntregasNoMes(notas),
    emAnalise: notas
      .filter((n) => n.status === "aguardando_conferencia")
      .reduce((s, n) => s + contarFotosEnviadasNota(n), 0),
    rejeitadas: notas.filter((n) => n.status === "rejeitada").length,
    conferidas: notas.filter((n) => n.status === "conferida").length,
    pagas: notas.filter((n) => n.status === "pago").length,
    valorAReceber,
    valorRecebido,
    pagamentoConfirmado,
    pagamentoAguardando,
  };
}

export function listarMesesPagosCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = new Set<string>();

  for (const p of data.pagamentosCooperado) {
    if (p.status !== "confirmado") continue;
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, coopId ?? p.cooperativaId);
    if (
      p.cooperadoId !== cooperadoId &&
      p.cooperadoId !== canonico &&
      pCanon !== canonico
    ) {
      continue;
    }
    meses.add(p.mesReferencia);
  }

  return [...meses].sort((a, b) => b.localeCompare(a));
}

export function listarResumosMensaisEntregas(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  return listarMesesEntregasCooperado(data, cooperadoId, cooperativaId)
    .map((mes) => getResumoMesEntregasCooperado(data, cooperadoId, mes, cooperativaId))
    .filter((r) => r.quantidadeEntregas > 0 || r.valorRecebido > 0 || r.valorAReceber > 0);
}
