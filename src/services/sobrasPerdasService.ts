import type { AppData, Cooperado, FichaCorridaDesconto } from "@/types";
import { round2, sumBy } from "@/utils/calculations";
import {
  getResumoPagamentoExibicao,
  getTotalAPagarCooperado,
} from "@/services/notaPedidoService";
import { listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";
import { valoresAvulsosPendentesMes } from "@/services/valoresAvulsosReceberService";

export interface LinhaIndicadorRelatorio {
  categoria: string;
  descricao: string;
  valor: number;
  quantidade?: number;
}

export interface LinhaCooperadoSobrasPerdas {
  cooperadoId: string;
  cooperadoNome: string;
  entregasConferidas: number;
  entregasAguardando: number;
  valorBruto: number;
  taxaCooperativa: number;
  outrasPerdas: number;
  creditosAvulsos: number;
  valorLiquido: number;
  valorPago: number;
  sobraAcertar: number;
  aguardandoAssinatura: number;
  statusPagamento: "pago" | "pendente" | "aguardando_assinatura" | "sem_entrega";
  detalhePerdas: { motivo: string; valor: number }[];
}

export interface EquacaoTransparencia {
  valorBrutoEntregas: number;
  totalPerdas: number;
  totalCreditos: number;
  valorLiquidoApurado: number;
  totalPagoConfirmado: number;
  totalAguardandoAssinatura: number;
  totalSobrasAcertar: number;
}

export interface RelatorioSobrasPerdas {
  mesReferencia: string;
  cooperativaId?: string;
  geradoEm: string;
  equacao: EquacaoTransparencia;
  perdas: LinhaIndicadorRelatorio[];
  sobras: LinhaIndicadorRelatorio[];
  linhasCooperado: LinhaCooperadoSobrasPerdas[];
  entregasConferidas: number;
  entregasAguardandoConferencia: number;
  entregasRejeitadas: number;
  observacoesTransparencia: string[];
}

function notasDoMes(data: AppData, mes: string, cooperativaId?: string) {
  return data.notasPedido.filter(
    (n) => n.mesReferencia === mes && (!cooperativaId || n.cooperativaId === cooperativaId)
  );
}

function notasConferidasOuPagas(data: AppData, mes: string, cooperativaId?: string) {
  return notasDoMes(data, mes, cooperativaId).filter(
    (n) => n.status === "conferida" || n.status === "pago"
  );
}

function agruparPerdasExtras(descontos: FichaCorridaDesconto[]): {
  outrasPerdas: number;
  creditos: number;
  detalhe: { motivo: string; valor: number }[];
} {
  const detalhe: { motivo: string; valor: number }[] = [];
  let outrasPerdas = 0;
  let creditos = 0;
  for (const d of descontos) {
    if (d.tipo === "credito_avulso") {
      creditos = round2(creditos + d.valor);
      detalhe.push({ motivo: d.motivo, valor: -d.valor });
    } else {
      outrasPerdas = round2(outrasPerdas + d.valor);
      detalhe.push({ motivo: d.motivo, valor: d.valor });
    }
  }
  return { outrasPerdas, creditos, detalhe };
}

function linhaCooperado(
  data: AppData,
  cooperado: Cooperado,
  mes: string,
  cooperativaId?: string
): LinhaCooperadoSobrasPerdas | null {
  const notasOk = notasConferidasOuPagas(data, mes, cooperativaId).filter(
    (n) => n.cooperadoId === cooperado.id
  );
  const notasAguardando = notasDoMes(data, mes, cooperativaId).filter(
    (n) => n.cooperadoId === cooperado.id && n.status === "aguardando_conferencia"
  );

  const pagamentoAguardando = data.pagamentosCooperado.find(
    (p) =>
      p.cooperadoId === cooperado.id &&
      p.mesReferencia === mes &&
      p.status === "aguardando_confirmacao" &&
      (!cooperativaId || p.cooperativaId === cooperativaId)
  );
  const pagamentoConfirmado = data.pagamentosCooperado.find(
    (p) =>
      p.cooperadoId === cooperado.id &&
      p.mesReferencia === mes &&
      p.status === "confirmado" &&
      (!cooperativaId || p.cooperativaId === cooperativaId)
  );

  const valorBruto = round2(sumBy(notasOk, (n) => n.valorBruto));
  const taxaCooperativa = round2(sumBy(notasOk, (n) => n.valorDesconto));
  const valorLiquidoNotas = round2(sumBy(notasOk, (n) => n.valorLiquido));

  if (
    notasOk.length === 0 &&
    notasAguardando.length === 0 &&
    !pagamentoAguardando &&
    !pagamentoConfirmado &&
    getTotalAPagarCooperado(data, cooperado.id, mes, cooperativaId) <= 0
  ) {
    return null;
  }

  let outrasPerdas = 0;
  let creditosAvulsos = 0;
  let detalhePerdas: { motivo: string; valor: number }[] = [];
  let valorLiquido = valorLiquidoNotas;
  let sobraAcertar = 0;
  let valorPago = 0;
  let aguardandoAssinatura = 0;
  let statusPagamento: LinhaCooperadoSobrasPerdas["statusPagamento"] = "sem_entrega";

  if (pagamentoConfirmado) {
    valorPago = pagamentoConfirmado.valorLiquido;
    valorLiquido = pagamentoConfirmado.valorLiquido;
    outrasPerdas = round2(
      pagamentoConfirmado.descontosExtras
        .filter((d) => d.tipo !== "credito_avulso")
        .reduce((s, d) => s + d.valor, 0)
    );
    creditosAvulsos = round2(
      pagamentoConfirmado.descontosExtras
        .filter((d) => d.tipo === "credito_avulso")
        .reduce((s, d) => s + d.valor, 0)
    );
    detalhePerdas = pagamentoConfirmado.descontosExtras.map((d) => ({
      motivo: d.motivo,
      valor: d.tipo === "credito_avulso" ? -d.valor : d.valor,
    }));
    statusPagamento = "pago";
  } else if (pagamentoAguardando) {
    valorLiquido = pagamentoAguardando.valorLiquido;
    aguardandoAssinatura = pagamentoAguardando.valorLiquido;
    sobraAcertar = pagamentoAguardando.valorLiquido;
    outrasPerdas = round2(
      pagamentoAguardando.descontosExtras
        .filter((d) => d.tipo !== "credito_avulso")
        .reduce((s, d) => s + d.valor, 0)
    );
    creditosAvulsos = round2(
      pagamentoAguardando.descontosExtras
        .filter((d) => d.tipo === "credito_avulso")
        .reduce((s, d) => s + d.valor, 0)
    );
    detalhePerdas = pagamentoAguardando.descontosExtras.map((d) => ({
      motivo: d.motivo,
      valor: d.tipo === "credito_avulso" ? -d.valor : d.valor,
    }));
    statusPagamento = "aguardando_assinatura";
  } else if (notasOk.length > 0 || getTotalAPagarCooperado(data, cooperado.id, mes, cooperativaId) > 0) {
    const resumo = getResumoPagamentoExibicao(data, cooperado.id, mes, cooperativaId);
    valorLiquido = resumo.valorLiquido;
    sobraAcertar = resumo.valorLiquido;
    const extras = agruparPerdasExtras(resumo.descontosExtras);
    outrasPerdas = extras.outrasPerdas;
    creditosAvulsos = extras.creditos;
    detalhePerdas = extras.detalhe;
    statusPagamento = resumo.valorLiquido > 0 ? "pendente" : "sem_entrega";
  }

  if (taxaCooperativa > 0) {
    detalhePerdas = [
      { motivo: "Taxa cooperativa sobre entregas", valor: taxaCooperativa },
      ...detalhePerdas,
    ];
  }

  return {
    cooperadoId: cooperado.id,
    cooperadoNome: cooperado.nomeCompleto,
    entregasConferidas: notasOk.length,
    entregasAguardando: notasAguardando.length,
    valorBruto,
    taxaCooperativa,
    outrasPerdas,
    creditosAvulsos,
    valorLiquido,
    valorPago,
    sobraAcertar,
    aguardandoAssinatura,
    statusPagamento,
    detalhePerdas,
  };
}

/** Relatório de sobras e perdas para transparência e acertos futuros. */
export function getRelatorioSobrasPerdas(
  mesReferencia: string,
  data: AppData,
  cooperativaId?: string
): RelatorioSobrasPerdas {
  const conferidas = notasConferidasOuPagas(data, mesReferencia, cooperativaId);
  const aguardando = notasDoMes(data, mesReferencia, cooperativaId).filter(
    (n) => n.status === "aguardando_conferencia"
  );
  const rejeitadas = notasDoMes(data, mesReferencia, cooperativaId).filter(
    (n) => n.status === "rejeitada"
  );

  const cooperados = cooperativaId
    ? listCooperadosDaCooperativa(data, cooperativaId)
    : data.cooperados;

  const linhasCooperado = cooperados
    .map((c) => linhaCooperado(data, c, mesReferencia, cooperativaId))
    .filter((l): l is LinhaCooperadoSobrasPerdas => l != null)
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  const valorBrutoEntregas = round2(sumBy(conferidas, (n) => n.valorBruto));
  const taxaCooperativaTotal = round2(sumBy(conferidas, (n) => n.valorDesconto));
  const outrasPerdasCooperados = round2(sumBy(linhasCooperado, (l) => l.outrasPerdas));
  const descontosLegado = round2(
    sumBy(
      data.descontos.filter(
        (d) =>
          d.data.startsWith(mesReferencia) &&
          (!cooperativaId ||
            data.cooperados.find((c) => c.id === d.cooperadoId)?.cooperativaId === cooperativaId)
      ),
      (d) => d.valorDescontado
    )
  );
  const totalPerdas = round2(taxaCooperativaTotal + outrasPerdasCooperados + descontosLegado);

  const creditosAvulsosTotal = round2(sumBy(linhasCooperado, (l) => l.creditosAvulsos));
  const avulsosPendentes = round2(
    sumBy(
      cooperados.flatMap((c) =>
        valoresAvulsosPendentesMes(data, c.id, mesReferencia, cooperativaId)
      ),
      (v) => v.valor
    )
  );

  const valorLiquidoApurado = round2(
    sumBy(linhasCooperado, (l) => l.valorLiquido)
  );
  const totalPagoConfirmado = round2(sumBy(linhasCooperado, (l) => l.valorPago));
  const totalAguardandoAssinatura = round2(
    sumBy(linhasCooperado, (l) => l.aguardandoAssinatura)
  );
  const totalSobrasAcertar = round2(sumBy(linhasCooperado, (l) => l.sobraAcertar));
  const brutoAguardandoConferencia = round2(sumBy(aguardando, (n) => n.valorBruto));

  const perdas: LinhaIndicadorRelatorio[] = [
    {
      categoria: "Taxa cooperativa",
      descricao: "Percentual retido sobre entregas conferidas (administração da cooperativa)",
      valor: taxaCooperativaTotal,
      quantidade: conferidas.length,
    },
    {
      categoria: "Mensalidades e descontos",
      descricao: "Retenções na ficha corrida (mensalidade, descontos avulsos e manuais)",
      valor: outrasPerdasCooperados,
    },
  ];
  if (descontosLegado > 0) {
    perdas.push({
      categoria: "Descontos registrados",
      descricao: "Lançamentos adicionais na aba Descontos",
      valor: descontosLegado,
    });
  }
  if (rejeitadas.length > 0) {
    perdas.push({
      categoria: "Entregas rejeitadas",
      descricao: "Entregas devolvidas para correção — não entram no valor a pagar",
      valor: round2(sumBy(rejeitadas, (n) => n.valorBruto)),
      quantidade: rejeitadas.length,
    });
  }

  const sobras: LinhaIndicadorRelatorio[] = [
    {
      categoria: "Valores a pagar",
      descricao: "Saldo líquido pendente de pagamento aos cooperados",
      valor: round2(
        sumBy(
          linhasCooperado.filter((l) => l.statusPagamento === "pendente"),
          (l) => l.sobraAcertar
        )
      ),
      quantidade: linhasCooperado.filter((l) => l.statusPagamento === "pendente").length,
    },
    {
      categoria: "Aguardando assinatura",
      descricao: "Pagamentos registrados aguardando confirmação do cooperado",
      valor: totalAguardandoAssinatura,
      quantidade: linhasCooperado.filter((l) => l.statusPagamento === "aguardando_assinatura").length,
    },
    {
      categoria: "Entregas em conferência",
      descricao: "Valor bruto de entregas ainda não conferidas pela cooperativa",
      valor: brutoAguardandoConferencia,
      quantidade: aguardando.length,
    },
  ];
  if (avulsosPendentes > 0) {
    sobras.push({
      categoria: "Valores avulsos a receber",
      descricao: "Créditos extras lançados e ainda não quitados na ficha",
      valor: avulsosPendentes,
    });
  }
  if (creditosAvulsosTotal > 0) {
    sobras.push({
      categoria: "Créditos na apuração",
      descricao: "Valores avulsos já considerados no líquido a pagar do mês",
      valor: creditosAvulsosTotal,
    });
  }

  const equacao: EquacaoTransparencia = {
    valorBrutoEntregas,
    totalPerdas,
    totalCreditos: creditosAvulsosTotal,
    valorLiquidoApurado,
    totalPagoConfirmado,
    totalAguardandoAssinatura,
    totalSobrasAcertar,
  };

  const observacoesTransparencia = [
    "Perdas correspondem a retenções, taxas e descontos que reduzem o valor bruto das entregas.",
    "Sobras correspondem a saldos a acertar: pagamentos pendentes, confirmações e entregas ainda em análise.",
    `Equação do mês: Bruto (${valorBrutoEntregas.toFixed(2)}) − Perdas (${totalPerdas.toFixed(2)}) + Créditos (${creditosAvulsosTotal.toFixed(2)}) = Líquido apurado (${valorLiquidoApurado.toFixed(2)}).`,
    `Acertos futuros: Líquido apurado − Pago confirmado (${totalPagoConfirmado.toFixed(2)}) = Saldo a acertar (${totalSobrasAcertar.toFixed(2)}).`,
  ];

  if (aguardando.length > 0) {
    observacoesTransparencia.push(
      `${aguardando.length} entrega(s) aguardando conferência podem alterar os totais após aprovação.`
    );
  }

  return {
    mesReferencia,
    cooperativaId,
    geradoEm: new Date().toISOString(),
    equacao,
    perdas: perdas.filter((p) => p.valor > 0 || (p.quantidade ?? 0) > 0),
    sobras: sobras.filter((s) => s.valor > 0 || (s.quantidade ?? 0) > 0),
    linhasCooperado,
    entregasConferidas: conferidas.length,
    entregasAguardandoConferencia: aguardando.length,
    entregasRejeitadas: rejeitadas.length,
    observacoesTransparencia,
  };
}
