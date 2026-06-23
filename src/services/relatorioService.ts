import type { AppData, Cooperado, FechamentoMensal, Instituicao, NotaPedido } from "@/types";
import { getCooperadoNome, round2, sumBy } from "@/utils/calculations";
import { getCurrentMesReferencia } from "@/utils/format";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";

export interface ResumoFinanceiroMes {
  mesReferencia: string;
  totalEntregas: number;
  totalVendasBruto: number;
  totalVendasLiquido: number;
  valoresAPagar: number;
  pagamentosRealizados: number;
  pagamentosPendentes: number;
  mensalidadesRecebidas: number;
  mensalidadesAbertas: number;
  cotasRecebidas: number;
  entregasAguardando: number;
}

export interface FechamentoCalculado {
  mesReferencia: string;
  totalVendas: number;
  totalPagamentos: number;
  totalMensalidades: number;
  totalCotas: number;
  totalDescontos: number;
  saldoCooperativa: number;
  qtdEntregas: number;
  qtdCooperadosPagos: number;
  qtdCooperadosAPagar: number;
  linhasCooperado: LinhaCooperadoFechamento[];
  linhasInstituicao: LinhaInstituicaoFechamento[];
}

export interface LinhaCooperadoFechamento {
  cooperadoId: string;
  cooperadoNome: string;
  entregas: number;
  valorBruto: number;
  valorLiquido: number;
  aPagar: number;
  pago: number;
  statusPagamento: "pago" | "pendente" | "aguardando_assinatura" | "sem_entrega";
}

export interface LinhaInstituicaoFechamento {
  instituicaoId: string;
  instituicaoNome: string;
  entregas: number;
  valorBruto: number;
  valorLiquido: number;
}

export interface LinhaItemEntregaRelatorio {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
  valorTotal: number;
}

export interface LinhaCooperadoItensRelatorio {
  cooperadoId: string;
  cooperadoNome: string;
  quantidadeEntregas: number;
  itens: LinhaItemEntregaRelatorio[];
  totalBruto: number;
}

export interface RelatorioEntregasPorItens {
  mesReferencia: string;
  instituicao: Instituicao | undefined;
  instituicaoNome: string;
  /** Totais consolidados de cada item, somando todos os cooperados do mês. */
  itens: LinhaItemEntregaRelatorio[];
  /** Detalhamento item a item por cooperado. */
  porCooperado: LinhaCooperadoItensRelatorio[];
  quantidadeEntregas: number;
  totalBruto: number;
  totalLiquido: number;
}

function notasDoMes(data: AppData, mes: string): NotaPedido[] {
  return data.notasPedido.filter((n) => n.mesReferencia === mes);
}

function notasConferidasOuPagas(data: AppData, mes: string): NotaPedido[] {
  return notasDoMes(data, mes).filter((n) => n.status === "conferida" || n.status === "pago");
}

export function listMesesComLancamentos(data: AppData): string[] {
  const set = new Set<string>();
  for (const n of data.notasPedido) set.add(n.mesReferencia);
  for (const f of data.fichaCorrida) set.add(f.mesReferencia);
  for (const p of data.pagamentosCooperado) set.add(p.mesReferencia);
  for (const m of data.mensalidades) set.add(m.mesReferencia);
  for (const f of data.fechamentos) set.add(f.mesReferencia);
  for (const c of data.cronogramasContrato ?? []) set.add(c.mesReferencia);
  for (const f of data.financeiro) set.add(f.mesReferencia);
  set.add(getCurrentMesReferencia());
  return [...set].sort().reverse();
}

export function calcularFechamentoMensalLive(mesReferencia: string, data: AppData): FechamentoCalculado {
  const notasMes = notasDoMes(data, mesReferencia);
  const notasOk = notasConferidasOuPagas(data, mesReferencia);
  const fichasMes = data.fichaCorrida.filter((f) => f.mesReferencia === mesReferencia);
  const pagamentosMes = data.pagamentosCooperado.filter((p) => p.mesReferencia === mesReferencia);
  const mensalidadesPagas = data.mensalidades.filter(
    (m) => m.mesReferencia === mesReferencia && m.status === "paga"
  );
  const cotasMes = data.cotas.flatMap((c) =>
    c.historicoPagamentos.filter((hp) => hp.data.startsWith(mesReferencia)).map((hp) => ({ ...hp, cooperadoId: c.cooperadoId }))
  );

  const totalVendas = sumBy(notasOk, (n) => n.valorBruto);
  const totalLiquidoEntregas = sumBy(notasOk, (n) => n.valorLiquido);
  const totalDescontosFicha = sumBy(fichasMes, (f) => f.descontos);
  const totalDescontosLegado = sumBy(
    data.descontos.filter((d) => d.data.startsWith(mesReferencia)),
    (d) => d.valorDescontado
  );
  const totalDescontos = totalDescontosFicha + totalDescontosLegado;

  const pagamentosConfirmados = pagamentosMes.filter((p) => p.status === "confirmado");
  const pagamentosAguardando = pagamentosMes.filter((p) => p.status === "aguardando_confirmacao");
  const totalPagamentos = sumBy(pagamentosConfirmados, (p) => p.valorLiquido);
  const totalMensalidades = sumBy(mensalidadesPagas, (m) => m.valor);
  const totalCotas = sumBy(cotasMes, (c) => c.valor);

  const valoresAPagar = sumBy(
    data.cooperados.map((c) => getTotalAPagarCooperado(data, c.id, mesReferencia)),
    (v) => v
  );

  const financeiro = data.financeiro.find((f) => f.mesReferencia === mesReferencia);
  const saldoCooperativa =
    financeiro?.saldoFinal ??
    totalMensalidades + totalCotas - totalPagamentos;

  const linhasCooperado = data.cooperados
    .map((c) => linhaCooperado(data, c, mesReferencia, pagamentosMes))
    .filter((l) => l.entregas > 0 || l.aPagar > 0 || l.pago > 0)
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  const instMap = new Map<string, LinhaInstituicaoFechamento>();
  for (const n of notasOk) {
    const nome =
      n.escolaAvulsaNome?.trim() ||
      data.instituicoes.find((i) => i.id === n.instituicaoId)?.nome ||
      "Instituição";
    const cur = instMap.get(n.instituicaoId) ?? {
      instituicaoId: n.instituicaoId,
      instituicaoNome: nome,
      entregas: 0,
      valorBruto: 0,
      valorLiquido: 0,
    };
    cur.entregas += 1;
    cur.valorBruto += n.valorBruto;
    cur.valorLiquido += n.valorLiquido;
    instMap.set(n.instituicaoId, cur);
  }

  return {
    mesReferencia,
    totalVendas,
    totalPagamentos,
    totalMensalidades,
    totalCotas,
    totalDescontos,
    saldoCooperativa,
    qtdEntregas: notasOk.length,
    qtdCooperadosPagos: pagamentosConfirmados.length,
    qtdCooperadosAPagar: data.cooperados.filter((c) => getTotalAPagarCooperado(data, c.id, mesReferencia) > 0).length,
    linhasCooperado,
    linhasInstituicao: [...instMap.values()].sort((a, b) => a.instituicaoNome.localeCompare(b.instituicaoNome, "pt-BR")),
  };
}

function linhaCooperado(
  data: AppData,
  cooperado: Cooperado,
  mes: string,
  pagamentosMes: AppData["pagamentosCooperado"]
): LinhaCooperadoFechamento {
  const notas = notasConferidasOuPagas(data, mes).filter((n) => n.cooperadoId === cooperado.id);
  const pg = pagamentosMes.find((p) => p.cooperadoId === cooperado.id);
  const aPagar = getTotalAPagarCooperado(data, cooperado.id, mes);
  let statusPagamento: LinhaCooperadoFechamento["statusPagamento"] = "sem_entrega";
  if (notas.length === 0) statusPagamento = "sem_entrega";
  else if (pg?.status === "confirmado") statusPagamento = "pago";
  else if (pg?.status === "aguardando_confirmacao") statusPagamento = "aguardando_assinatura";
  else if (aPagar > 0) statusPagamento = "pendente";
  else if (notas.some((n) => n.status === "pago")) statusPagamento = "pago";

  return {
    cooperadoId: cooperado.id,
    cooperadoNome: cooperado.nomeCompleto,
    entregas: notas.length,
    valorBruto: sumBy(notas, (n) => n.valorBruto),
    valorLiquido: sumBy(notas, (n) => n.valorLiquido),
    aPagar,
    pago: pg?.status === "confirmado" ? pg.valorLiquido : sumBy(notas.filter((n) => n.status === "pago"), (n) => n.valorLiquido),
    statusPagamento,
  };
}

export function getResumoFinanceiroMes(mesReferencia: string, data: AppData): ResumoFinanceiroMes {
  const calc = calcularFechamentoMensalLive(mesReferencia, data);
  const pagamentosMes = data.pagamentosCooperado.filter((p) => p.mesReferencia === mesReferencia);
  const mensAbertas = data.mensalidades.filter(
    (m) => m.mesReferencia === mesReferencia && m.status !== "paga"
  );

  return {
    mesReferencia,
    totalEntregas: calc.qtdEntregas,
    totalVendasBruto: calc.totalVendas,
    totalVendasLiquido: sumBy(notasConferidasOuPagas(data, mesReferencia), (n) => n.valorLiquido),
    valoresAPagar: sumBy(calc.linhasCooperado, (l) => l.aPagar),
    pagamentosRealizados: calc.totalPagamentos,
    pagamentosPendentes: sumBy(
      pagamentosMes.filter((p) => p.status === "aguardando_confirmacao"),
      (p) => p.valorLiquido
    ),
    mensalidadesRecebidas: calc.totalMensalidades,
    mensalidadesAbertas: sumBy(mensAbertas, (m) => m.valor),
    cotasRecebidas: calc.totalCotas,
    entregasAguardando: notasDoMes(data, mesReferencia).filter((n) => n.status === "aguardando_conferencia").length,
  };
}

export function getRelatorioPagarCooperado(mesReferencia: string, data: AppData, cooperadoId?: string) {
  const linhas = calcularFechamentoMensalLive(mesReferencia, data).linhasCooperado.filter(
    (l) => l.aPagar > 0 && (!cooperadoId || l.cooperadoId === cooperadoId)
  );
  return linhas.map((l) => ({ cooperado: l.cooperadoNome, total: l.aPagar, entregas: l.entregas }));
}

export function getRelatorioEntregasInstituicaoLive(
  mesReferencia: string,
  instituicaoId: string,
  data: AppData
) {
  const inst = data.instituicoes.find((i) => i.id === instituicaoId);
  const entregas = notasConferidasOuPagas(data, mesReferencia).filter((n) => n.instituicaoId === instituicaoId);
  return {
    instituicao: inst,
    entregas,
    totalBruto: sumBy(entregas, (n) => n.valorBruto),
    totalLiquido: sumBy(entregas, (n) => n.valorLiquido),
  };
}

export function getRelatorioPNAELive(mesReferencia: string, data: AppData) {
  const instPNAE = data.instituicoes.filter((i) => i.tipo === "PNAE");
  const ids = new Set(instPNAE.map((i) => i.id));
  const entregas = notasConferidasOuPagas(data, mesReferencia).filter((n) => ids.has(n.instituicaoId));
  return {
    instituicoes: instPNAE,
    entregas,
    totalBruto: sumBy(entregas, (n) => n.valorBruto),
    totalLiquido: sumBy(entregas, (n) => n.valorLiquido),
  };
}

function chaveItemRelatorio(item: {
  produtoInstituicaoId?: string;
  produtoNome: string;
  unidade: string;
}): string {
  if (item.produtoInstituicaoId) return `id:${item.produtoInstituicaoId}`;
  return `nome:${item.produtoNome.trim().toLowerCase()}::${item.unidade.trim().toLowerCase()}`;
}

function agregarItensDasNotas(notas: NotaPedido[]): LinhaItemEntregaRelatorio[] {
  const map = new Map<string, LinhaItemEntregaRelatorio>();
  for (const nota of notas) {
    for (const item of nota.itens ?? []) {
      if (item.quantidade <= 0) continue;
      const key = chaveItemRelatorio(item);
      const valor = round2(item.quantidade * item.precoUnitario);
      const cur = map.get(key);
      if (cur) {
        cur.quantidade = round2(cur.quantidade + item.quantidade);
        cur.valorTotal = round2(cur.valorTotal + valor);
        cur.precoUnitario =
          cur.quantidade > 0 ? round2(cur.valorTotal / cur.quantidade) : cur.precoUnitario;
      } else {
        map.set(key, {
          produtoInstituicaoId: item.produtoInstituicaoId,
          produtoNome: item.produtoNome,
          unidade: item.unidade,
          precoUnitario: item.precoUnitario,
          quantidade: item.quantidade,
          valorTotal: valor,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
}

/** Consolida quantidades e valores por item das entregas conferidas de uma instituição no mês. */
export function getRelatorioEntregasPorItensInstituicao(
  mesReferencia: string,
  instituicaoId: string,
  data: AppData,
  cooperativaId?: string
): RelatorioEntregasPorItens {
  const inst = data.instituicoes.find((i) => i.id === instituicaoId);
  const notas = notasConferidasOuPagas(data, mesReferencia).filter(
    (n) =>
      n.instituicaoId === instituicaoId &&
      (!cooperativaId || n.cooperativaId === cooperativaId)
  );

  const itens = agregarItensDasNotas(notas);

  const porCooperadoMap = new Map<string, NotaPedido[]>();
  for (const nota of notas) {
    const list = porCooperadoMap.get(nota.cooperadoId) ?? [];
    list.push(nota);
    porCooperadoMap.set(nota.cooperadoId, list);
  }

  const porCooperado: LinhaCooperadoItensRelatorio[] = [...porCooperadoMap.entries()]
    .map(([cooperadoId, notasCoop]) => {
      const itensCoop = agregarItensDasNotas(notasCoop);
      return {
        cooperadoId,
        cooperadoNome: getCooperadoNomeSafe(data, cooperadoId),
        quantidadeEntregas: notasCoop.length,
        itens: itensCoop,
        totalBruto: round2(itensCoop.reduce((s, i) => s + i.valorTotal, 0)),
      };
    })
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  const totalItens = round2(itens.reduce((s, i) => s + i.valorTotal, 0));

  return {
    mesReferencia,
    instituicao: inst,
    instituicaoNome: inst?.nome ?? "Instituição",
    itens,
    porCooperado,
    quantidadeEntregas: notas.length,
    totalBruto: totalItens > 0 ? totalItens : sumBy(notas, (n) => n.valorBruto),
    totalLiquido: sumBy(notas, (n) => n.valorLiquido),
  };
}

export function fechamentoToPartial(calc: FechamentoCalculado): Partial<FechamentoMensal> {
  return {
    mesReferencia: calc.mesReferencia,
    totalVendas: calc.totalVendas,
    totalPagamentos: calc.totalPagamentos,
    totalMensalidades: calc.totalMensalidades,
    totalCotas: calc.totalCotas,
    totalDescontos: calc.totalDescontos,
    saldoCooperativa: calc.saldoCooperativa,
  };
}

export function getCooperadoNomeSafe(data: AppData, id: string): string {
  return getCooperadoNome(data.cooperados, id);
}
