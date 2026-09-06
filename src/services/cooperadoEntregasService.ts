import type { AppData, NotaPedido, PagamentoCooperadoRegistro } from "@/types";
import { notaPertenceCooperado, fichaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  getPagamentoAguardandoCooperado,
  getTotalAPagarCooperado,
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
  getResumoPagamentoConsolidadoCooperado,
  pagamentoCobreMesReferencia,
  getMesesReferenciaPagamento,
  fichaValidaNoExtrato,
} from "@/services/notaPedidoService";
import { formatMesReferencia, formatMesesReferenciaRotulo, getCurrentMesReferencia } from "@/utils/format";
import { mesesComValoresAvulsos, totalValoresAvulsosPendentes } from "@/services/valoresAvulsosReceberService";
import { contarEntregasNoMes } from "@/services/entregaCooperadoService";
import { contarFotosEnviadasNota, getFotosExibicaoNota } from "@/utils/fotoEntrega";

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function valorLiquidoMesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): number {
  return getResumoValorAPagarRelatorio(data, cooperadoId, mesReferencia, cooperativaId).valorLiquido;
}

/** Meses com valor pendente ou aguardando assinatura (ordem cronológica). */
export function listarMesesPendentesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const pendentes: string[] = [];
  for (const mes of [...listarMesesEntregasCooperado(data, cooperadoId, cooperativaId)].sort((a, b) =>
    a.localeCompare(b)
  )) {
    if (cooperadoMesQuitado(data, cooperadoId, mes)) continue;
    if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) {
      pendentes.push(mes);
      continue;
    }
    if (valorLiquidoMesQuantoVouReceber(data, cooperadoId, mes, cooperativaId) > 0) {
      pendentes.push(mes);
      continue;
    }
    if (totalValoresAvulsosPendentes(data, cooperadoId, mes, cooperativaId) > 0) {
      pendentes.push(mes);
    }
  }
  return pendentes;
}

/** Mês mais antigo ainda em aberto — base para abatimento HB Créditos e ficha principal. */
export function getMesPrincipalQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string {
  const pendentes = listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
  if (pendentes.length) return pendentes[0];
  return getMesQuantoVouReceber(data, cooperadoId, cooperativaId);
}

/** Valor a receber no início — oculta mês quitado ou sem valor pendente. */
export function cooperadoExibirValorReceberInicio(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): {
  exibir: boolean;
  mes: string;
  meses: string[];
  mesLabel: string;
  valor: number;
  aguardandoAssinatura: boolean;
} {
  const { mes, meses, mesLabel, valor, aguardandoAssinatura } = getValorQuantoVouReceber(
    data,
    cooperadoId,
    cooperativaId
  );
  if (aguardandoAssinatura) {
    return { exibir: true, mes, meses, mesLabel, valor, aguardandoAssinatura: true };
  }
  if (meses.length === 1 && getPagamentoConfirmadoMes(data, cooperadoId, mes)) {
    return { exibir: false, mes, meses, mesLabel, valor: 0, aguardandoAssinatura: false };
  }
  if (valor <= 0 || meses.length === 0) {
    return { exibir: false, mes, meses, mesLabel, valor: 0, aguardandoAssinatura: false };
  }
  return { exibir: true, mes, meses, mesLabel, valor, aguardandoAssinatura: false };
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
  for (const f of data.fichaCorrida) {
    if (!fichaPertenceCooperado(data, f, cooperadoId, cooperativaId)) continue;
    if (f.status === "pendente" && fichaValidaNoExtrato(data, f)) {
      set.add(f.mesReferencia);
    }
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
      pagamentoCobreMesReferencia(p, mesReferencia) &&
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

/** Meses com valor líquido pendente de PIX pelo responsável. */
export function listarMesesPendentesPagamentoResponsavel(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const pendentes: string[] = [];
  for (const mes of [...listarMesesEntregasCooperado(data, cooperadoId, cooperativaId)].sort((a, b) =>
    a.localeCompare(b)
  )) {
    if (getPagamentoConfirmadoMes(data, cooperadoId, mes)) continue;
    if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) {
      pendentes.push(mes);
      continue;
    }
    if (getResumoValorAPagarRelatorio(data, cooperadoId, mes, cooperativaId).valorLiquido > 0) {
      pendentes.push(mes);
      continue;
    }
    if (totalValoresAvulsosPendentes(data, cooperadoId, mes, cooperativaId) > 0) {
      pendentes.push(mes);
    }
  }
  return pendentes;
}

/** Cooperado ainda sem pagamento registrado pelo responsável (um ou mais meses). */
export function cooperadoPendentePagamentoResponsavel(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string,
  cooperativaId?: string
): boolean {
  const meses = listarMesesPendentesPagamentoResponsavel(data, cooperadoId, cooperativaId);
  if (mesReferencia && !meses.includes(mesReferencia)) return false;
  if (!meses.length) return false;

  const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId);
  if (!aguardando) return true;

  const cobertos = new Set(getMesesReferenciaPagamento(aguardando));
  const mesesSemCobertura = meses.filter((m) => !cobertos.has(m));
  if (mesReferencia) return mesesSemCobertura.includes(mesReferencia);
  return mesesSemCobertura.length > 0;
}

export function cooperadoTemValorPendente(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  return getValorQuantoVouReceber(data, cooperadoId, cooperativaId).valor > 0;
}

export function getValorQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): {
  mes: string;
  meses: string[];
  mesLabel: string;
  valor: number;
  aguardandoAssinatura: boolean;
} {
  const mesesPendentes = listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
  const mes = mesesPendentes[mesesPendentes.length - 1] ?? getMesQuantoVouReceber(data, cooperadoId, cooperativaId);
  const mesLabel =
    mesesPendentes.length > 0
      ? formatMesesReferenciaRotulo(mesesPendentes)
      : formatMesReferencia(mes);
  const aguardandoAssinatura = mesesPendentes.some((m) =>
    Boolean(getPagamentoAguardandoCooperado(data, cooperadoId, m))
  );
  const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId);
  let valor = 0;
  if (aguardando) {
    const cobertos = new Set(getMesesReferenciaPagamento(aguardando));
    valor = aguardando.valorLiquido;
    const mesesSemCobertura = mesesPendentes.filter((m) => !cobertos.has(m));
    if (mesesSemCobertura.length > 1) {
      valor += getResumoPagamentoConsolidadoCooperado(
        data,
        cooperadoId,
        mesesSemCobertura,
        cooperativaId
      ).valorLiquido;
    } else if (mesesSemCobertura.length === 1) {
      valor += valorLiquidoMesQuantoVouReceber(data, cooperadoId, mesesSemCobertura[0], cooperativaId);
    }
  } else if (mesesPendentes.length > 1) {
    valor = getResumoPagamentoConsolidadoCooperado(
      data,
      cooperadoId,
      mesesPendentes,
      cooperativaId
    ).valorLiquido;
  } else {
    valor = mesesPendentes.reduce(
      (s, m) => s + valorLiquidoMesQuantoVouReceber(data, cooperadoId, m, cooperativaId),
      0
    );
  }
  valor = round2(valor);
  return { mes, meses: mesesPendentes, mesLabel, valor, aguardandoAssinatura };
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
  const valorAReceber = getResumoValorAPagarRelatorio(
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
    emAnalise: contarFotosEmAnaliseCooperado(notas),
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

/** Foto de fato anexada — ignora flags obsoletas (fotoNaNuvem/fotoEnviadaEm sem arquivo). */
function notaTemConteudoFotoReal(nota: NotaPedido): boolean {
  if (getFotosExibicaoNota(nota).length > 0) return true;
  if (nota.fotoPedido || nota.fotoPedidoMiniatura) return true;
  if (nota.fotosPedido?.some(Boolean)) return true;
  return Boolean(
    nota.fotosMeta?.some((f) => f.storagePath || f.url || f.thumbnailUrl || f.status === "uploaded")
  );
}

/** Entrega do cooperado aguardando conferência e com foto real enviada. */
export function notaEmAnaliseCooperado(nota: NotaPedido): boolean {
  return nota.status === "aguardando_conferencia" && notaTemConteudoFotoReal(nota);
}

/** Total de fotos em análise — usado no Início e nos resumos mensais do cooperado. */
export function contarFotosEmAnaliseCooperado(notas: NotaPedido[]): number {
  return notas.filter(notaEmAnaliseCooperado).reduce((total, nota) => {
    const exibidas = getFotosExibicaoNota(nota).length;
    const meta =
      nota.fotosMeta?.filter((f) => f.storagePath || f.url || f.thumbnailUrl || f.status === "uploaded")
        .length ?? 0;
    const noArray = nota.fotosPedido?.filter(Boolean).length ?? 0;
    const count = Math.max(exibidas, meta, noArray);
    if (count > 0) return total + count;
    if (nota.fotoPedido || nota.fotoPedidoMiniatura) return total + 1;
    return total;
  }, 0);
}

export function notaTemFotoEnviadaCooperado(nota: NotaPedido): boolean {
  if (nota.status === "cancelado") return false;
  if (
    nota.status === "rascunho" &&
    !nota.fotoNaNuvem &&
    !nota.fotoEnviadaEm &&
    !nota.fotoPedido &&
    !(nota.fotosPedido?.length ?? 0)
  ) {
    return false;
  }
  return (
    contarFotosEnviadasNota(nota) > 0 ||
    Boolean(nota.fotoNaNuvem) ||
    Boolean(nota.fotoEnviadaEm) ||
    Boolean(nota.fotoPedido || nota.fotosPedido?.length) ||
    Boolean(nota.fotosMeta?.some((f) => f.storagePath || f.url || f.thumbnailUrl))
  );
}

export function filtrarNotasComFotoEnviada(notas: NotaPedido[]): NotaPedido[] {
  return notas.filter(notaTemFotoEnviadaCooperado);
}

/** Resumos mensais só com notas que têm foto enviada (pendente ou já lançada). */
export function listarResumosFotosCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  const porMes = new Map<string, NotaPedido[]>();

  for (const nota of notasDoCooperado(data, cooperadoId, cooperativaId)) {
    if (!notaTemFotoEnviadaCooperado(nota)) continue;
    const list = porMes.get(nota.mesReferencia) ?? [];
    list.push(nota);
    porMes.set(nota.mesReferencia, list);
  }

  return [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mesReferencia, notas]) => {
      const ordenadas = ordenarNotasMesCronologico(notas);
      const resumo = getResumoMesEntregasCooperado(data, cooperadoId, mesReferencia, cooperativaId);
      return {
        ...resumo,
        notas: ordenadas,
        quantidadeEntregas: contarEntregasNoMes(ordenadas),
      };
    });
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
