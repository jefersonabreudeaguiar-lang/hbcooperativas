import type { AppData } from "@/types";
import { round2, sumBy } from "@/utils/calculations";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { calcularFechamentoMensalLive, listMesesComLancamentos } from "@/services/relatorioService";
import { resumoLivroCaixa } from "@/services/livroCaixaService";
import { getUserCooperativaId } from "@/utils/cooperativa";

export type ConciliacaoStatus = "ok" | "divergencia" | "ausente" | "parcial";

export interface LinhaConciliacao {
  id: string;
  label: string;
  descricao: string;
  valorA: number;
  labelA: string;
  valorB: number;
  labelB: string;
  diferenca: number;
  status: ConciliacaoStatus;
  detalhe?: string;
}

export interface AlertaConciliacao {
  id: string;
  severidade: "info" | "aviso" | "critico";
  titulo: string;
  descricao: string;
  href?: string;
}

export interface ConciliacaoMensalResult {
  mesReferencia: string;
  linhas: LinhaConciliacao[];
  alertas: AlertaConciliacao[];
  resumo: {
    totalLinhas: number;
    conciliadas: number;
    divergencias: number;
    ausentes: number;
    percentualOk: number;
  };
  kpis: {
    totalEntregasConferidas: number;
    totalAPagarCooperados: number;
    totalPagoCooperados: number;
    pagamentosSemAssinatura: number;
    notasSemFicha: number;
    mensalidadesAbertas: number;
    fechamentoStatus: string | null;
  };
}

const TOLERANCIA = 0.02;

function compare(valorA: number, valorB: number): ConciliacaoStatus {
  if (valorA === 0 && valorB === 0) return "ausente";
  if (Math.abs(valorA - valorB) <= TOLERANCIA) return "ok";
  return "divergencia";
}

function notasConferidasMes(data: AppData, mes: string) {
  return data.notasPedido.filter(
    (n) => n.mesReferencia === mes && (n.status === "conferida" || n.status === "pago")
  );
}

function sumDescontosPorTipo(
  data: AppData,
  mes: string,
  tipo: "cooperativa" | "mensalidade" | "cota" | "conta_coop"
): number {
  const fichas = data.fichaCorrida.filter((f) => f.mesReferencia === mes);
  let total = 0;
  for (const f of fichas) {
    for (const d of f.descontosDetalhe ?? []) {
      if (d.tipo === tipo) total += d.valor;
    }
  }
  for (const p of data.pagamentosCooperado.filter((pg) => pg.mesReferencia === mes)) {
    for (const d of p.descontosExtras ?? []) {
      if (d.tipo === tipo) total += d.valor;
    }
  }
  return round2(total);
}

function countNotasSemFicha(data: AppData, mes: string): number {
  const notas = notasConferidasMes(data, mes);
  const fichaNotaIds = new Set(
    data.fichaCorrida.filter((f) => f.mesReferencia === mes).map((f) => f.notaPedidoId)
  );
  return notas.filter((n) => !fichaNotaIds.has(n.id)).length;
}

export function calcularConciliacaoMensal(
  data: AppData,
  mesReferencia: string,
  cooperativaId?: string
): ConciliacaoMensalResult {
  const coopId = cooperativaId ?? data.cooperativas[0]?.id ?? "";
  const fechamento = data.fechamentos.find((f) => f.mesReferencia === mesReferencia);
  const calc = calcularFechamentoMensalLive(mesReferencia, data);

  const notasOk = notasConferidasMes(data, mesReferencia);
  const fichasMes = data.fichaCorrida.filter((f) => f.mesReferencia === mesReferencia);
  const totalBrutoNotas = round2(sumBy(notasOk, (n) => n.valorBruto));
  const totalBrutoFicha = round2(sumBy(fichasMes, (f) => f.valorBruto));

  const descontoCoopFicha = sumDescontosPorTipo(data, mesReferencia, "cooperativa");
  const descontoCoopPagamentos = round2(
    sumBy(
      data.pagamentosCooperado.filter((p) => p.mesReferencia === mesReferencia),
      (p) => p.descontoCooperativa
    )
  );
  const descontoCoopTotal = round2(descontoCoopFicha + descontoCoopPagamentos);

  const ajusteMes = data.ajustesFichaMes?.find(
    (a) => a.cooperativaId === coopId && a.mesReferencia === mesReferencia
  );
  const descontoAvulsoCoop = ajusteMes?.descontoAvulso ?? 0;

  const descontoMensFicha = sumDescontosPorTipo(data, mesReferencia, "mensalidade");
  const mensalidadesPagas = data.mensalidades.filter(
    (m) => m.mesReferencia === mesReferencia && m.status === "paga"
  );
  const totalMensPagas = round2(sumBy(mensalidadesPagas, (m) => m.valor));

  const descontoCotaFicha = sumDescontosPorTipo(data, mesReferencia, "cota");
  const cotasMes = data.cotas.flatMap((c) =>
    c.historicoPagamentos.filter((hp) => hp.data.startsWith(mesReferencia))
  );
  const totalCotas = round2(sumBy(cotasMes, (c) => c.valor));

  const descontoContaCoop = sumDescontosPorTipo(data, mesReferencia, "conta_coop");

  const pagamentosMes = data.pagamentosCooperado.filter((p) => p.mesReferencia === mesReferencia);
  const pagamentosConfirmados = pagamentosMes.filter((p) => p.status === "confirmado");
  const totalPagoCooperados = round2(sumBy(pagamentosConfirmados, (p) => p.valorLiquido));

  const caixaMes = resumoLivroCaixa(data, coopId, mesReferencia);
  const debitosPagamentoCaixa = round2(
    sumBy(
      caixaMes.lancamentos.filter((l) => l.origem === "pagamento_cooperado" && l.tipo === "debito"),
      (l) => l.valor
    )
  );

  const creditosMensCaixa = round2(
    sumBy(
      caixaMes.lancamentos.filter((l) => l.origem === "mensalidade" && l.tipo === "credito"),
      (l) => l.valor
    )
  );

  const creditosTaxaCoopCaixa = round2(
    sumBy(
      caixaMes.lancamentos.filter((l) => l.origem === "taxa_cooperativa" && l.tipo === "credito"),
      (l) => l.valor
    )
  );

  const creditosMensFichaCaixa = round2(
    sumBy(
      caixaMes.lancamentos.filter((l) => l.origem === "mensalidade_ficha" && l.tipo === "credito"),
      (l) => l.valor
    )
  );

  const debitosHbAppRepasse = round2(
    sumBy(
      caixaMes.lancamentos.filter((l) => l.origem === "hb_app_repasse" && l.tipo === "debito"),
      (l) => l.valor
    )
  );

  const descontoMensPagamentos = round2(
    sumBy(pagamentosMes, (p) =>
      (p.descontosExtras ?? []).filter((d) => d.tipo === "mensalidade").reduce((s, d) => s + d.valor, 0)
    )
  );
  const descontoMensRetido = round2(Math.max(descontoMensFicha, descontoMensPagamentos));

  const totalAPagar = round2(
    sumBy(data.cooperados, (c) => getTotalAPagarCooperado(data, c.id, mesReferencia))
  );

  const linhas: LinhaConciliacao[] = [
    {
      id: "entregas_ficha",
      label: "Entregas × Ficha",
      descricao: "Valor bruto das notas conferidas versus lançamentos na ficha corrida.",
      valorA: totalBrutoNotas,
      labelA: "Notas conferidas",
      valorB: totalBrutoFicha,
      labelB: "Ficha corrida (bruto)",
      diferenca: round2(totalBrutoNotas - totalBrutoFicha),
      status: compare(totalBrutoNotas, totalBrutoFicha),
      detalhe: countNotasSemFicha(data, mesReferencia) > 0
        ? `${countNotasSemFicha(data, mesReferencia)} nota(s) conferida(s) sem ficha.`
        : undefined,
    },
    {
      id: "desconto_mensalidade",
      label: "Mensalidades descontadas",
      descricao: "Descontos tipo mensalidade na ficha versus mensalidades confirmadas como pagas.",
      valorA: descontoMensFicha,
      labelA: "Desconto na ficha",
      valorB: totalMensPagas,
      labelB: "Mensalidades pagas",
      diferenca: round2(descontoMensFicha - totalMensPagas),
      status: compare(descontoMensFicha, totalMensPagas),
    },
    {
      id: "desconto_cota",
      label: "Cotas descontadas",
      descricao: "Descontos de cota na ficha versus cotas recebidas no mês.",
      valorA: descontoCotaFicha,
      labelB: "Cotas recebidas",
      valorB: totalCotas,
      labelA: "Desconto na ficha",
      diferenca: round2(descontoCotaFicha - totalCotas),
      status: compare(descontoCotaFicha, totalCotas),
    },
    {
      id: "pagamentos_caixa",
      label: "Pagamentos × Livro caixa",
      descricao: "Pagamentos confirmados aos cooperados versus débitos no livro caixa.",
      valorA: totalPagoCooperados,
      labelA: "Pagamentos confirmados",
      valorB: debitosPagamentoCaixa,
      labelB: "Débitos no caixa",
      diferenca: round2(totalPagoCooperados - debitosPagamentoCaixa),
      status:
        totalPagoCooperados > 0 && debitosPagamentoCaixa === 0
          ? "divergencia"
          : compare(totalPagoCooperados, debitosPagamentoCaixa),
      detalhe:
        totalPagoCooperados > 0 && debitosPagamentoCaixa === 0
          ? "Pagamentos registrados sem lançamento correspondente no livro caixa."
          : undefined,
    },
    {
      id: "mensalidades_caixa",
      label: "Mensalidades × Livro caixa",
      descricao: "Mensalidades pagas via PIX versus créditos registrados no livro caixa.",
      valorA: totalMensPagas,
      labelA: "Mensalidades pagas (PIX)",
      valorB: creditosMensCaixa,
      labelB: "Créditos PIX no caixa",
      diferenca: round2(totalMensPagas - creditosMensCaixa),
      status:
        totalMensPagas > 0 && creditosMensCaixa === 0 ? "divergencia" : compare(totalMensPagas, creditosMensCaixa),
    },
    {
      id: "mensalidade_ficha_caixa",
      label: "Mensalidade na ficha × Caixa",
      descricao: "Mensalidade abatida no pagamento do cooperado versus crédito contábil no livro caixa.",
      valorA: descontoMensRetido,
      labelA: "Mensalidade retida na ficha",
      valorB: creditosMensFichaCaixa,
      labelB: "Crédito contábil no caixa",
      diferenca: round2(descontoMensRetido - creditosMensFichaCaixa),
      status:
        descontoMensRetido > 0 && creditosMensFichaCaixa === 0
          ? "divergencia"
          : compare(descontoMensRetido, creditosMensFichaCaixa),
      detalhe:
        descontoMensRetido > 0 && creditosMensFichaCaixa === 0
          ? "Desconto de mensalidade na ficha sem lançamento contábil correspondente."
          : undefined,
    },
    {
      id: "taxa_cooperativa_caixa",
      label: "Taxa cooperativa × Caixa",
      descricao: "Taxa de 5% retida nos pagamentos versus créditos contábeis no livro caixa.",
      valorA: descontoCoopPagamentos,
      labelA: "Taxa nos pagamentos",
      valorB: creditosTaxaCoopCaixa,
      labelB: "Crédito contábil no caixa",
      diferenca: round2(descontoCoopPagamentos - creditosTaxaCoopCaixa),
      status:
        descontoCoopPagamentos > 0 && creditosTaxaCoopCaixa === 0
          ? "divergencia"
          : compare(descontoCoopPagamentos, creditosTaxaCoopCaixa),
      detalhe:
        descontoCoopPagamentos > 0 && creditosTaxaCoopCaixa === 0
          ? "Taxa cooperativa sem lançamento contábil correspondente no livro caixa."
          : undefined,
    },
    {
      id: "obrigacao_pagamento",
      label: "Obrigação × Pagamentos",
      descricao: "Total a pagar aos cooperados versus total efetivamente pago (confirmado).",
      valorA: totalAPagar,
      labelA: "A pagar (ficha)",
      valorB: totalPagoCooperados,
      labelB: "Pago confirmado",
      diferenca: round2(totalAPagar - totalPagoCooperados),
      status: totalAPagar >= totalPagoCooperados - TOLERANCIA ? "ok" : "divergencia",
      detalhe:
        totalAPagar > totalPagoCooperados + TOLERANCIA
          ? `Saldo pendente de pagamento: R$ ${(totalAPagar - totalPagoCooperados).toFixed(2)}`
          : undefined,
    },
    {
      id: "conta_coop",
      label: "Conta Coop (ficha)",
      descricao: "Total de descontos Conta Coop lançados na ficha do mês.",
      valorA: descontoContaCoop,
      labelA: "Desconto ficha",
      valorB: descontoContaCoop,
      labelB: "Referência ficha",
      diferenca: 0,
      status: descontoContaCoop > 0 ? "parcial" : "ausente",
      detalhe:
        descontoContaCoop > 0
          ? "Conciliação com ledger HB Credit na nuvem — ver aba Conta Coop."
          : "Sem compras Conta Coop neste mês.",
    },
    {
      id: "hb_app_repasse_caixa",
      label: "Repasse HB (20% Conta Coop)",
      descricao: "Débito no livro caixa por repasse confirmado à plataforma HB (taxa 20% do desconto).",
      valorA: debitosHbAppRepasse,
      labelA: "Pago (livro caixa)",
      valorB: debitosHbAppRepasse,
      labelB: "Registrado no caixa",
      diferenca: 0,
      status:
        debitosHbAppRepasse > 0
          ? "ok"
          : descontoContaCoop > 0
            ? "parcial"
            : "ausente",
      detalhe:
        descontoContaCoop > 0 && debitosHbAppRepasse === 0
          ? "Há movimento Conta Coop na ficha, mas repasse HB 20% ainda não confirmado no livro caixa (aba Conta Coop > Descontos)."
          : debitosHbAppRepasse > 0
            ? "Valor apurado na nuvem — conferir aba Conta Coop > Descontos."
            : undefined,
    },
  ];

  if (descontoCoopTotal > 0 || descontoAvulsoCoop > 0) {
    linhas.splice(1, 0, {
      id: "desconto_cooperativa",
      label: "Desconto cooperativa",
      descricao: "Percentual/desconto da cooperativa na ficha versus ajuste avulso do mês.",
      valorA: descontoCoopTotal,
      labelA: "Descontos na ficha/pagamentos",
      valorB: descontoAvulsoCoop,
      labelB: "Desconto avulso do mês",
      diferenca: round2(descontoCoopTotal - descontoAvulsoCoop),
      status: descontoAvulsoCoop > 0 ? compare(descontoCoopTotal, descontoAvulsoCoop) : "parcial",
    });
  }

  const alertas: AlertaConciliacao[] = [];
  const now = Date.now();
  const seteDias = 7 * 24 * 60 * 60 * 1000;

  for (const p of pagamentosMes.filter((pg) => pg.status === "aguardando_confirmacao")) {
    const idade = now - new Date(p.pagoEm).getTime();
    if (idade > seteDias) {
      alertas.push({
        id: `pg_sem_assinatura_${p.id}`,
        severidade: "aviso",
        titulo: "Pagamento sem assinatura do cooperado",
        descricao: `Pagamento de ${p.mesReferencia} aguardando confirmação há mais de 7 dias.`,
        href: "/ficha-corrida",
      });
    }
  }

  const notasSemFicha = countNotasSemFicha(data, mesReferencia);
  if (notasSemFicha > 0) {
    alertas.push({
      id: "notas_sem_ficha",
      severidade: "critico",
      titulo: "Notas conferidas sem ficha",
      descricao: `${notasSemFicha} entrega(s) conferida(s) ainda não lançada(s) na ficha corrida.`,
      href: "/ficha-corrida",
    });
  }

  for (const l of linhas.filter((x) => x.status === "divergencia")) {
    alertas.push({
      id: `div_${l.id}`,
      severidade: "critico",
      titulo: `Divergência: ${l.label}`,
      descricao: `Diferença de R$ ${Math.abs(l.diferenca).toFixed(2)} entre ${l.labelA} e ${l.labelB}.`,
      href: "/contador/conciliacao",
    });
  }

  if (fechamento?.status === "aprovado" && linhas.some((l) => l.status === "divergencia")) {
    alertas.push({
      id: "fechamento_com_divergencia",
      severidade: "critico",
      titulo: "Fechamento aprovado com divergência",
      descricao: "O mês está aprovado no fechamento, mas a conciliação ainda aponta diferenças.",
      href: "/fechamento-mensal",
    });
  }

  const mensAbertas = data.mensalidades.filter(
    (m) => m.mesReferencia === mesReferencia && m.status !== "paga"
  ).length;
  if (mensAbertas > 0) {
    alertas.push({
      id: "mensalidades_abertas",
      severidade: "info",
      titulo: "Mensalidades em aberto",
      descricao: `${mensAbertas} mensalidade(s) pendente(s) no mês.`,
      href: "/mensalidades",
    });
  }

  const conciliadas = linhas.filter((l) => l.status === "ok").length;
  const divergencias = linhas.filter((l) => l.status === "divergencia").length;
  const ausentes = linhas.filter((l) => l.status === "ausente").length;

  return {
    mesReferencia,
    linhas,
    alertas,
    resumo: {
      totalLinhas: linhas.length,
      conciliadas,
      divergencias,
      ausentes,
      percentualOk: linhas.length ? Math.round((conciliadas / linhas.length) * 100) : 100,
    },
    kpis: {
      totalEntregasConferidas: notasOk.length,
      totalAPagarCooperados: totalAPagar,
      totalPagoCooperados: totalPagoCooperados,
      pagamentosSemAssinatura: pagamentosMes.filter((p) => p.status === "aguardando_confirmacao").length,
      notasSemFicha: notasSemFicha,
      mensalidadesAbertas: mensAbertas,
      fechamentoStatus: fechamento?.status ?? null,
    },
  };
}

export function listMesesConciliacao(data: AppData): string[] {
  return listMesesComLancamentos(data);
}

export function getDemonstrativoPagamentosMes(data: AppData, mesReferencia: string) {
  const pagamentos = data.pagamentosCooperado
    .filter((p) => p.mesReferencia === mesReferencia)
    .sort((a, b) => new Date(b.pagoEm).getTime() - new Date(a.pagoEm).getTime());

  return pagamentos.map((p) => {
    const cooperado = data.cooperados.find((c) => c.id === p.cooperadoId);
    return {
      id: p.id,
      cooperadoNome: cooperado?.nomeCompleto ?? "Cooperado",
      valorBruto: p.valorBruto,
      descontoCooperativa: p.descontoCooperativa,
      descontosExtras: p.descontosExtras,
      valorLiquido: p.valorLiquido,
      status: p.status,
      pagoPor: p.pagoPor,
      pagoEm: p.pagoEm,
      assinado: Boolean(p.assinaturaCooperado),
      assinadoEm: p.assinadoEm,
      qtdEntregas: p.notaPedidoIds.length,
    };
  });
}

export { getUserCooperativaId };
