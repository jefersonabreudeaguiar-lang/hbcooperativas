import type { AppData, NotaPedido, PagamentoCooperadoRegistro } from "@/types";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { notaPertenceCooperado, fichaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  getPagamentoAguardandoCooperado,
  getTotalAPagarCooperado,
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
  getResumoPagamentoConsolidadoCooperado,
  getResumoPagamentoExibicao,
  pagamentoCobreMesReferencia,
  getMesesReferenciaPagamento,
  resumoFromPagamento,
  resumoComplementaresPosPagamento,
  fichaValidaNoExtrato,
  listarFichasPendentesPagamento,
  listarMesesDebitoAbertoCooperado,
  fichasPendentesComplementaresPosPagamentoAguardando,
  type AjustesResumoPagamento,
  valorLiquidoFromResumoPartes,
} from "@/services/notaPedidoService";
import { formatMesReferencia, formatMesesReferenciaRotulo, getCurrentMesReferencia } from "@/utils/format";
import {
  mesesComValoresAvulsos,
  temValoresAvulsosPendentesMes,
  totalValoresAvulsosPendentes,
} from "@/services/valoresAvulsosReceberService";
import { contarEntregasNoMes } from "@/services/entregaCooperadoService";
import { contarFotosEnviadasNota, getFotosExibicaoNota } from "@/utils/fotoEntrega";
import { cooperadoMesComFichaPagaSemPagamentoCooperativa } from "@/services/pagamentoIntegridadeService";
import { idsNotasPedidoExcluidas } from "@/services/notaPedidoService";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";
import { normalizeCnpj } from "@/utils/cooperativa";

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

function valorLiquidoMesesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  meses: string[],
  cooperativaId?: string
): number {
  const uniq = [...new Set(meses)].sort();
  if (!uniq.length) return 0;
  if (uniq.length === 1) {
    return valorLiquidoMesQuantoVouReceber(data, cooperadoId, uniq[0], cooperativaId);
  }
  return getResumoPagamentoConsolidadoCooperado(data, cooperadoId, uniq, cooperativaId).valorLiquido;
}

/** Cooperado: só débito líquido em aberto (ficha/resumo), sem mês só “PIX aguardando assinatura”. */
function calcularValorEMesesAbertoQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): { mesesComValor: string[]; valor: number } {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const mesesComValor: string[] = [];
  for (const mes of listarMesesPendentesFinanceiroCooperado(data, cooperadoId, cooperativaId)) {
    const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId, mes);
    const confirmado = getPagamentoConfirmadoMes(data, cooperadoId, mes);
    if (aguardando && !confirmado) continue;
    const vl = valorLiquidoMesQuantoVouReceber(data, cooperadoId, mes, cooperativaId);
    const avulsos = totalValoresAvulsosPendentes(data, cooperadoId, mes, coopId);
    if (vl > 0 || avulsos > 0) mesesComValor.push(mes);
  }
  const valor = round2(valorLiquidoMesesQuantoVouReceber(data, cooperadoId, mesesComValor, cooperativaId));
  return { mesesComValor, valor };
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
    if (cooperadoMesComFichaPagaSemPagamentoCooperativa(data, cooperadoId, mes, cooperativaId)) {
      pendentes.push(mes);
      continue;
    }
    if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) {
      pendentes.push(mes);
      continue;
    }
    if (valorLiquidoMesQuantoVouReceber(data, cooperadoId, mes, cooperativaId) > 0) {
      pendentes.push(mes);
      continue;
    }
    if (temValoresAvulsosPendentesMes(data, cooperadoId, mes, cooperativaId)) {
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
  const pendentes = listarMesesPendentesFinanceiroCooperado(data, cooperadoId, cooperativaId);
  if (pendentes.length) return pendentes[0];
  return getMesQuantoVouReceber(data, cooperadoId, cooperativaId);
}

/** Meses com valor líquido pendente (exclui mês só aguardando assinatura de PIX já quitado). */
export function listarMesesComValorQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  return calcularValorEMesesAbertoQuantoVouReceber(data, cooperadoId, cooperativaId).mesesComValor;
}

/**
 * Meses que compõem resumo consolidado e “a receber” — mesma lista para responsável (Pagar/Financeiro)
 * e cooperado (Início/Financeiro), após sync operacional + HB.
 */
export function listarMesesReferenciaResumoFinanceiroParidade(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const mesesComValor = listarMesesComValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  if (mesesComValor.length > 0) return [...mesesComValor].sort();
  const mesesPendentes = listarMesesPendentesFinanceiroCooperado(data, cooperadoId, cooperativaId);
  return [...mesesPendentes].sort();
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
  valorRecibo: number;
  aguardandoAssinatura: boolean;
} {
  const { mes, meses, mesLabel, valor, valorRecibo, aguardandoAssinatura } =
    getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const mesesCanon =
    meses.length > 0 ? meses : valor > 0 && mes ? [mes] : meses;
  const mesLabelCanon =
    mesesCanon.length > 0
      ? mesesCanon.length === meses.length
        ? mesLabel
        : formatMesReferencia(mes)
      : mesLabel;

  if (isBicCentralReadAuthorityEnabled()) {
    const bicVal = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
    const mesesBic =
      bicVal.meses.length > 0 ? bicVal.meses : bicVal.valor > 0 && bicVal.mes ? [bicVal.mes] : [];
    const mesLabelBic =
      mesesBic.length > 0
        ? mesesBic.length === bicVal.meses.length
          ? bicVal.mesLabel
          : formatMesReferencia(bicVal.mes)
        : bicVal.mesLabel;
    if (bicVal.valor <= 0 || mesesBic.length === 0) {
      return {
        exibir: false,
        mes: bicVal.mes,
        meses: mesesBic,
        mesLabel: mesLabelBic,
        valor: 0,
        valorRecibo: 0,
        aguardandoAssinatura: false,
      };
    }
    return {
      exibir: true,
      mes: bicVal.mes,
      meses: mesesBic,
      mesLabel: mesLabelBic,
      valor: bicVal.valor,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }

  if (aguardandoAssinatura) {
    return {
      exibir: true,
      mes,
      meses: mesesCanon,
      mesLabel: mesLabelCanon,
      valor: 0,
      valorRecibo,
      aguardandoAssinatura: true,
    };
  }
  if (mesesCanon.length === 1 && getPagamentoConfirmadoMes(data, cooperadoId, mes) && valor <= 0) {
    return {
      exibir: false,
      mes,
      meses: mesesCanon,
      mesLabel: mesLabelCanon,
      valor: 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }
  if (valor <= 0 || mesesCanon.length === 0) {
    return {
      exibir: false,
      mes,
      meses: mesesCanon,
      mesLabel: mesLabelCanon,
      valor: 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }
  return {
    exibir: true,
    mes,
    meses: mesesCanon,
    mesLabel: mesLabelCanon,
    valor,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
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

/** Remove meses já quitados (PIX confirmado, sem débito) — Início, entregas e HB operacional. */
export function filtrarResumosMesesNaoQuitados(
  data: AppData,
  cooperadoId: string,
  resumos: ResumoMesEntregasCooperado[]
): ResumoMesEntregasCooperado[] {
  return resumos.filter((r) => !cooperadoMesQuitado(data, cooperadoId, r.mesReferencia));
}

function notasDoCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): NotaPedido[] {
  const excluidas = idsNotasPedidoExcluidas(data, cooperativaId);
  return data.notasPedido
    .filter(
      (n) =>
        !excluidas.has(n.id) && notaPertenceCooperado(data, n, cooperadoId, cooperativaId)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Tombstones novos no sync operacional — entregas que sumiram da lista do cooperado. */
export function contarEntregasApagadasCooperadoNoSync(
  antes: AppData,
  depois: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const exclAntes = idsNotasPedidoExcluidas(antes, cooperativaId);
  const exclDepois = idsNotasPedidoExcluidas(depois, cooperativaId);
  let count = 0;
  for (const id of exclDepois) {
    if (exclAntes.has(id)) continue;
    const nota = antes.notasPedido.find((n) => n.id === id);
    if (!nota) continue;
    if (!notaPertenceCooperado(antes, nota, cooperadoId, cooperativaId)) continue;
    if (nota.status !== "aguardando_conferencia" && nota.status !== "rejeitada") continue;
    count += 1;
  }
  return count;
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
      continue;
    }
    if (
      f.status === "pago" &&
      fichaValidaNoExtrato(data, f) &&
      cooperadoMesComFichaPagaSemPagamentoCooperativa(data, cooperadoId, f.mesReferencia, cooperativaId)
    ) {
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
  if (
    listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId).some((f) =>
      fichaValidaNoExtrato(data, f)
    )
  ) {
    return false;
  }
  if (getTotalAPagarCooperado(data, cooperadoId, mesReferencia) > 0) return false;
  if (temValoresAvulsosPendentesMes(data, cooperadoId, mesReferencia, coopId)) return false;
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
    if (temValoresAvulsosPendentesMes(data, cooperadoId, mes, cooperativaId)) return mes;
  }

  return mesAtual;
}

/** Meses com valor líquido pendente de PIX pelo responsável (mesma base do cooperado — início/ficha). */
function cooperativaCnpjFromData(
  data: AppData,
  cooperativaId?: string,
  cooperadoId?: string
): string | null {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const coop = data.cooperativas.find((c) => c.id === coopId);
  if (!coop?.cnpj) return null;
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : null;
}

function listarMesesPendentesFinanceiroCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const cnpj = cooperativaCnpjFromData(data, cooperativaId, cooperadoId);
  if (cnpj && isOperacionalCloudAuthoritative(cnpj)) {
    return listarMesesPendentesPagamentoResponsavelOperacional(data, cooperadoId, cooperativaId);
  }
  return listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
}

/** Após restore na nuvem: fila Pagar segue ficha/pagamentos do operacional, sem inflar por notas soltas. */
function listarMesesPendentesPagamentoResponsavelOperacional(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const mesesSet = new Set<string>();
  for (const f of data.fichaCorrida) {
    if (!fichaPertenceCooperado(data, f, cooperadoId, cooperativaId)) continue;
    if (!fichaValidaNoExtrato(data, f)) continue;
    if (f.status === "pendente" || f.status === "pago") {
      mesesSet.add(f.mesReferencia);
    }
  }
  for (const mes of mesesComValoresAvulsos(data, cooperadoId, cooperativaId)) {
    mesesSet.add(mes);
  }
  const pendentes: string[] = [];
  for (const mes of [...mesesSet].sort((a, b) => a.localeCompare(b))) {
    if (cooperadoMesQuitado(data, cooperadoId, mes)) continue;
    if (cooperadoMesComFichaPagaSemPagamentoCooperativa(data, cooperadoId, mes, cooperativaId)) {
      pendentes.push(mes);
      continue;
    }
    if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) {
      pendentes.push(mes);
      continue;
    }
    const temFichaPendente = data.fichaCorrida.some(
      (f) =>
        fichaPertenceCooperado(data, f, cooperadoId, cooperativaId) &&
        f.mesReferencia === mes &&
        f.status === "pendente" &&
        fichaValidaNoExtrato(data, f)
    );
    if (temFichaPendente) {
      pendentes.push(mes);
      continue;
    }
    if (getTotalAPagarCooperado(data, cooperadoId, mes, cooperativaId) > 0) {
      pendentes.push(mes);
    } else if (temValoresAvulsosPendentesMes(data, cooperadoId, mes, cooperativaId)) {
      pendentes.push(mes);
    }
  }
  return pendentes;
}

export function listarMesesPendentesPagamentoResponsavel(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const cnpj = cooperativaCnpjFromData(data, cooperativaId, cooperadoId);
  if (cnpj && isOperacionalCloudAuthoritative(cnpj)) {
    return listarMesesPendentesPagamentoResponsavelOperacional(data, cooperadoId, cooperativaId);
  }
  return listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
}

export type ConsolidadoFinanceiroCooperado = {
  meses: string[];
  mesReferenciaPrincipal: string;
  mesLabel: string;
  valorLiquido: number;
  aguardandoAssinatura: boolean;
  resumo: ReturnType<typeof getResumoPagamentoConsolidadoCooperado>;
};

/** Fonte única: total a receber, meses em aberto e resumo (responsável ↔ cooperado ↔ início). */
export function getConsolidadoFinanceiroCooperadoMotorLegado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  ajustesPorMes?: Record<string, AjustesResumoPagamento>
): ConsolidadoFinanceiroCooperado {
  const meses = listarMesesPendentesFinanceiroCooperado(data, cooperadoId, cooperativaId);
  const mesesComValor = listarMesesComValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  const { valor: valorAberto } = calcularValorEMesesAbertoQuantoVouReceber(
    data,
    cooperadoId,
    cooperativaId
  );
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const mesReferenciaPrincipal = getMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
  const pagamentoAguardando = getPagamentoAguardandoCooperado(data, cooperadoId);
  const mesesPixAguardando = pagamentoAguardando ? getMesesReferenciaPagamento(pagamentoAguardando) : [];
  const aguardandoAssinatura =
    mesesPixAguardando.length > 0
      ? mesesPixAguardando.some((m) => !getPagamentoConfirmadoMes(data, cooperadoId, m))
      : meses.some(
          (m) =>
            Boolean(getPagamentoAguardandoCooperado(data, cooperadoId, m)) &&
            !getPagamentoConfirmadoMes(data, cooperadoId, m)
        );

  let resumo: ConsolidadoFinanceiroCooperado["resumo"];
  if (aguardandoAssinatura && pagamentoAguardando && valorAberto <= 0) {
    const mesesPix = getMesesReferenciaPagamento(pagamentoAguardando);
    resumo =
      mesesPix.length === 1
        ? getResumoPagamentoExibicao(
            data,
            cooperadoId,
            mesesPix[0],
            coopId,
            ajustesPorMes?.[mesesPix[0]]
          )
        : getResumoPagamentoConsolidadoCooperado(
            data,
            cooperadoId,
            mesesPix,
            coopId,
            ajustesPorMes
          );
  } else if (mesesComValor.length === 1) {
    resumo =
      resumoComplementaresPosPagamento(data, cooperadoId, mesesComValor[0], coopId) ??
      getResumoPagamentoExibicao(data, cooperadoId, mesesComValor[0], coopId, ajustesPorMes?.[mesesComValor[0]]);
  } else if (mesesComValor.length > 1) {
    resumo = getResumoPagamentoConsolidadoCooperado(data, cooperadoId, mesesComValor, coopId, ajustesPorMes);
  } else if (meses.length === 1) {
    resumo = getResumoPagamentoExibicao(
      data,
      cooperadoId,
      meses[0],
      coopId,
      ajustesPorMes?.[meses[0]]
    );
  } else {
    resumo = {
      valorBruto: 0,
      descontoCooperativa: 0,
      descontosExtras: [],
      valorEntregas: 0,
      valorLiquido: 0,
      fichaIds: [],
      notaPedidoIds: [],
    };
  }

  const valorLiquidoLinhas = valorLiquidoFromResumoPartes(resumo.valorEntregas, resumo.descontosExtras);
  let valorLiquidoExibir = valorLiquidoLinhas;
  if (aguardandoAssinatura && pagamentoAguardando && valorAberto <= 0) {
    valorLiquidoExibir = 0;
  }
  resumo = { ...resumo, valorLiquido: valorLiquidoExibir };

  const mesesResumo = listarMesesReferenciaResumoFinanceiroParidade(data, cooperadoId, cooperativaId);
  const mesLabel =
    mesesResumo.length > 0
      ? formatMesesReferenciaRotulo(mesesResumo)
      : meses.length > 0
        ? formatMesesReferenciaRotulo(meses)
        : formatMesReferencia(mesReferenciaPrincipal);

  return {
    meses,
    mesReferenciaPrincipal,
    mesLabel,
    valorLiquido: valorLiquidoExibir,
    aguardandoAssinatura,
    resumo,
  };
}

export function getConsolidadoFinanceiroCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  ajustesPorMes?: Record<string, AjustesResumoPagamento>
): ConsolidadoFinanceiroCooperado {
  if (isBicCentralReadAuthorityEnabled()) {
    const { bicCentralGetConsolidadoFinanceiroCooperado } =
      require("@/services/bicLeituraCentralCooperado") as typeof import("@/services/bicLeituraCentralCooperado");
    return bicCentralGetConsolidadoFinanceiroCooperado(data, cooperadoId, cooperativaId, ajustesPorMes);
  }
  return getConsolidadoFinanceiroCooperadoMotorLegado(data, cooperadoId, cooperativaId, ajustesPorMes);
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

  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  for (const mes of mesReferencia ? [mesReferencia] : meses) {
    if (
      fichasPendentesComplementaresPosPagamentoAguardando(data, cooperadoId, mes, coopId).length > 0
    ) {
      return true;
    }
    if (getTotalAPagarCooperado(data, cooperadoId, mes, coopId) > 0) {
      return true;
    }
  }

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

export function getValorQuantoVouReceberMotorLegado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): {
  mes: string;
  meses: string[];
  mesLabel: string;
  valor: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
} {
  const consolidado = getConsolidadoFinanceiroCooperadoMotorLegado(data, cooperadoId, cooperativaId);
  const mesesResumo = listarMesesReferenciaResumoFinanceiroParidade(data, cooperadoId, cooperativaId);
  const meses =
    mesesResumo.length > 0
      ? mesesResumo
      : consolidado.meses.length > 0
        ? consolidado.meses
        : consolidado.mesReferenciaPrincipal
          ? [consolidado.mesReferenciaPrincipal]
          : [];
  const mes =
    meses[meses.length - 1] ??
    getMesQuantoVouReceber(data, cooperadoId, cooperativaId);
  const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId);
  const valorRecibo =
    consolidado.aguardandoAssinatura && aguardando ? round2(aguardando.valorLiquido) : 0;
  const valorExibir =
    consolidado.aguardandoAssinatura && valorRecibo > 0 ? 0 : consolidado.valorLiquido;
  return {
    mes,
    meses,
    mesLabel: consolidado.mesLabel,
    valor: valorExibir,
    valorRecibo,
    aguardandoAssinatura: consolidado.aguardandoAssinatura,
  };
}

/** Entrada única do app — com BIC oficial/LAB delega ao hub central (paridade LAB). */
export function getValorQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ReturnType<typeof getValorQuantoVouReceberMotorLegado> {
  if (isBicCentralReadAuthorityEnabled()) {
    const { bicCentralValorAReceberAgregado } =
      require("@/services/bicLeituraCentralCooperado") as typeof import("@/services/bicLeituraCentralCooperado");
    return bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId);
  }
  return getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
}

export type EstadoQuantoVouReceberCooperado =
  | "carregando"
  | "nada_pendente"
  | "a_receber"
  | "aguardando_assinatura";

/** Facade UI cooperado — uma leitura estável para Início e Quanto vou receber (Fase 3). */
export function getResumoQuantoVouReceberCooperadoMotorLegado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: { carregandoNuvem?: boolean; financeiroSincronizando?: boolean }
): {
  estado: EstadoQuantoVouReceberCooperado;
  mesLabel: string;
  valorDestaque: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
  valorAberto: number;
  tituloValor: string;
  subtitulo: string;
  acaoRotulo: string | null;
} {
  const base = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const carregando = Boolean(opts?.carregandoNuvem || opts?.financeiroSincronizando);

  if (carregando) {
    return {
      estado: "carregando",
      mesLabel: base.mesLabel,
      valorDestaque: 0,
      valorRecibo: base.valorRecibo,
      aguardandoAssinatura: base.aguardandoAssinatura,
      valorAberto: base.valor,
      tituloValor: "Atualizando",
      subtitulo: "Baixando pagamentos e valores da cooperativa…",
      acaoRotulo: null,
    };
  }

  if (base.aguardandoAssinatura && base.valorRecibo > 0) {
    return {
      estado: "aguardando_assinatura",
      mesLabel: base.mesLabel,
      valorDestaque: base.valorRecibo,
      valorRecibo: base.valorRecibo,
      aguardandoAssinatura: true,
      valorAberto: base.valor,
      tituloValor: "PIX registrado — falta assinar",
      subtitulo: "Confira o valor e confirme o recebimento assinando o recibo.",
      acaoRotulo: "Confirmar recebimento",
    };
  }

  if (base.valor > 0) {
    return {
      estado: "a_receber",
      mesLabel: base.mesLabel,
      valorDestaque: base.valor,
      valorRecibo: base.valorRecibo,
      aguardandoAssinatura: false,
      valorAberto: base.valor,
      tituloValor: "Total a receber",
      subtitulo: "Valor líquido das entregas conferidas (antes do pagamento da cooperativa).",
      acaoRotulo: null,
    };
  }

  return {
    estado: "nada_pendente",
    mesLabel: base.mesLabel,
    valorDestaque: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
    valorAberto: 0,
    tituloValor: "Nada a receber agora",
    subtitulo: "Quando a cooperativa aprovar suas entregas, o valor aparece aqui.",
    acaoRotulo: null,
  };
}

export function getResumoQuantoVouReceberCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: { carregandoNuvem?: boolean; financeiroSincronizando?: boolean }
): ReturnType<typeof getResumoQuantoVouReceberCooperadoMotorLegado> {
  if (isBicCentralReadAuthorityEnabled()) {
    const { bicCentralResumoQuantoVouReceberCooperado } =
      require("@/services/bicLeituraCentralCooperado") as typeof import("@/services/bicLeituraCentralCooperado");
    return bicCentralResumoQuantoVouReceberCooperado(data, cooperadoId, cooperativaId, opts);
  }

  return getResumoQuantoVouReceberCooperadoMotorLegado(data, cooperadoId, cooperativaId, opts);
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
    for (const mes of getMesesReferenciaPagamento(p)) {
      meses.add(mes);
    }
  }

  return [...meses].sort((a, b) => b.localeCompare(a));
}

/**
 * Extrato histórico na Minha ficha — meses com pagamento confirmado.
 * Valores vêm do registro PIX (`pagamentoConfirmado`), sem recalcular M6/BIC.
 */
export function listarResumosExtratoHistoricoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  return listarMesesPagosCooperado(data, cooperadoId, cooperativaId)
    .map((mes) => getResumoMesEntregasCooperado(data, cooperadoId, mes, cooperativaId))
    .filter(
      (r) =>
        r.pagamentoConfirmado != null &&
        cooperadoMesQuitado(data, cooperadoId, r.mesReferencia)
    );
}

/** Total recebido — soma pagamentos confirmados (sem duplicar PIX que cobre vários meses). */
export function somarTotalRecebidoConfirmadoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const vistos = new Set<string>();
  let total = 0;
  for (const p of data.pagamentosCooperado) {
    if (p.status !== "confirmado") continue;
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, coopId ?? p.cooperativaId);
    if (p.cooperadoId !== cooperadoId && p.cooperadoId !== canonico && pCanon !== canonico) continue;
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    total += Number(p.valorLiquido) || 0;
  }
  return round2(total);
}

/** Meses com PIX registrado (aguardando assinatura ou confirmado) — abas de histórico por mês. */
export function listarMesesComPagamentoRegistradoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = new Set<string>();

  for (const p of data.pagamentosCooperado) {
    if (p.status !== "confirmado" && p.status !== "aguardando_confirmacao") continue;
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, coopId ?? p.cooperativaId);
    if (
      p.cooperadoId !== cooperadoId &&
      p.cooperadoId !== canonico &&
      pCanon !== canonico
    ) {
      continue;
    }
    for (const mes of getMesesReferenciaPagamento(p)) {
      meses.add(mes);
    }
  }

  return [...meses].sort((a, b) => b.localeCompare(a));
}

/** Pagamento registrado naquele mês (confirmado tem prioridade sobre aguardando assinatura). */
export function getPagamentoRegistradoMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): PagamentoCooperadoRegistro | undefined {
  return (
    getPagamentoConfirmadoMes(data, cooperadoId, mesReferencia) ??
    getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia)
  );
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
