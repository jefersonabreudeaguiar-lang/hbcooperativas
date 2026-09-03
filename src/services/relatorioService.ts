import type { AppData, Cooperado, FichaCorrida, FechamentoMensal, Instituicao, NotaPedido, NotaPedidoItem } from "@/types";
import { getCooperadoNome, round2, sumBy } from "@/utils/calculations";
import { formatMesReferencia, formatMesesReferenciaRotulo, getCurrentMesReferencia } from "@/utils/format";
import { notaPertenceCooperado } from "@/services/cooperadoCloudService";
import { listarMesesPendentesPagamentoResponsavel } from "@/services/cooperadoEntregasService";
import {
  agregarItensNotasCooperado,
  getPagamentoAguardandoCooperado,
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
  getTotalAPagarCooperado,
  listarFichasExtratoCooperadoMes,
  listarFichasPendentesPagamento,
} from "@/services/notaPedidoService";

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

export interface RelatorioEntregasPorItensEmAberto extends RelatorioEntregasPorItens {
  meses: string[];
  mesesLabel: string;
  escopo: "pendente";
}

export interface RelatorioEntregasPorItensPeriodo extends RelatorioEntregasPorItens {
  meses: string[];
  mesesLabel: string;
  /** Quando true, inclui só entregas de meses/cooperados com pagamento pendente. */
  apenasPendente: boolean;
}

export type OpcoesRelatorioEntregasPorItens = {
  apenasPendente?: boolean;
};

export interface ResumoFinanceiroEmAberto {
  meses: string[];
  mesesLabel: string;
  totalEntregas: number;
  totalVendasBruto: number;
  totalVendasLiquido: number;
  valoresAPagar: number;
  cooperadosComDebito: number;
  entregasAguardando: number;
}

export type LinhaMensalidadeAberta = {
  id: string;
  cooperadoId: string;
  cooperadoNome: string;
  mesReferencia: string;
  valor: number;
  vencimento: string;
  status: string;
};

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
  const notas = notasConferidasOuPagas(data, mes).filter((n) =>
    notaPertenceCooperado(data, n, cooperado.id, cooperado.cooperativaId)
  );
  const fichas = listarFichasExtratoCooperadoMes(data, cooperado.id, mes, cooperado.cooperativaId);
  const fichaNotaIds = new Set(fichas.map((f) => f.notaPedidoId));
  const semFicha = notas.filter((n) => !fichaNotaIds.has(n.id));

  const entregas = new Set([...fichas.map((f) => f.notaPedidoId), ...semFicha.map((n) => n.id)]).size;
  const valorBruto = round2(
    fichas.reduce((s, f) => s + f.valorBruto, 0) + semFicha.reduce((s, n) => s + n.valorBruto, 0)
  );
  const valorLiquido = round2(
    fichas.reduce((s, f) => s + f.valorLiquido, 0) + semFicha.reduce((s, n) => s + n.valorLiquido, 0)
  );

  const pg = pagamentosMes.find((p) => p.cooperadoId === cooperado.id);
  const aPagar = getTotalAPagarCooperado(data, cooperado.id, mes);
  let statusPagamento: LinhaCooperadoFechamento["statusPagamento"] = "sem_entrega";
  if (entregas === 0) statusPagamento = "sem_entrega";
  else if (pg?.status === "confirmado") statusPagamento = "pago";
  else if (pg?.status === "aguardando_confirmacao") statusPagamento = "aguardando_assinatura";
  else if (aPagar > 0) statusPagamento = "pendente";
  else if (notas.some((n) => n.status === "pago")) statusPagamento = "pago";

  return {
    cooperadoId: cooperado.id,
    cooperadoNome: cooperado.nomeCompleto,
    entregas,
    valorBruto,
    valorLiquido,
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
  return data.cooperados
    .filter(
      (c) =>
        c.status === "ativo" &&
        (!cooperadoId || c.id === cooperadoId)
    )
    .map((c) => {
      const resumo = getResumoValorAPagarRelatorio(data, c.id, mesReferencia, c.cooperativaId);
      if (resumo.valorLiquido <= 0) return null;
      return {
        cooperado: c.nomeCompleto,
        total: resumo.valorLiquido,
        entregas: resumo.fichaIds.length,
      };
    })
    .filter((l): l is { cooperado: string; total: number; entregas: number } => l !== null)
    .sort((a, b) => a.cooperado.localeCompare(b.cooperado, "pt-BR"));
}

export type LinhaPagarCooperadoEmAberto = {
  cooperadoId: string;
  cooperado: string;
  meses: string[];
  mesesLabel: string;
  entregas: number;
  total: number;
  porMes: {
    mes: string;
    mesLabel: string;
    entregas: number;
    total: number;
  }[];
};

export type LinhaPagarCooperadoEmAbertoTabela = {
  id: string;
  cooperado: string;
  mesesLabel: string;
  entregas: number;
  total: number;
};

/** Uma linha por cooperado, ou por mês quando houver mais de um mês em aberto. */
export function flattenLinhasPagarCooperadoEmAberto(
  linhas: LinhaPagarCooperadoEmAberto[]
): LinhaPagarCooperadoEmAbertoTabela[] {
  const detalharPorMes = linhas.some((r) => r.porMes.length > 1);
  if (detalharPorMes) {
    return linhas.flatMap((r) =>
      r.porMes.map((m) => ({
        id: `${r.cooperadoId}-${m.mes}`,
        cooperado: r.cooperado,
        mesesLabel: m.mesLabel,
        entregas: m.entregas,
        total: m.total,
      }))
    );
  }
  return linhas.map((r) => ({
    id: r.cooperadoId,
    cooperado: r.cooperado,
    mesesLabel: r.mesesLabel,
    entregas: r.entregas,
    total: r.total,
  }));
}

/** Total geral a pagar a cooperados (todos os meses em aberto). Fonte única para relatórios consolidados. */
export function getTotalValoresAPagarEmAberto(data: AppData, cooperativaId?: string): number {
  return round2(
    getRelatorioPagarCooperadoEmAberto(data, cooperativaId).reduce((s, l) => s + l.total, 0)
  );
}

/** Valores a pagar consolidados — todos os meses pendentes por cooperado. */
export function getRelatorioPagarCooperadoEmAberto(
  data: AppData,
  cooperativaId?: string,
  cooperadoId?: string
): LinhaPagarCooperadoEmAberto[] {
  return data.cooperados
    .filter(
      (c) =>
        c.status === "ativo" &&
        (!cooperativaId || c.cooperativaId === cooperativaId) &&
        (!cooperadoId || c.id === cooperadoId)
    )
    .map((c) => {
      const meses = listarMesesPendentesPagamentoResponsavel(data, c.id, cooperativaId);
      let entregas = 0;
      let total = 0;
      const porMes: LinhaPagarCooperadoEmAberto["porMes"] = [];
      for (const mes of meses) {
        const resumo = getResumoValorAPagarRelatorio(data, c.id, mes, cooperativaId);
        if (resumo.valorLiquido <= 0) continue;
        total = round2(total + resumo.valorLiquido);
        entregas += resumo.fichaIds.length;
        porMes.push({
          mes,
          mesLabel: formatMesReferencia(mes),
          entregas: resumo.fichaIds.length,
          total: resumo.valorLiquido,
        });
      }
      return {
        cooperadoId: c.id,
        cooperado: c.nomeCompleto,
        meses: porMes.map((m) => m.mes),
        mesesLabel: porMes.length ? formatMesesReferenciaRotulo(porMes.map((m) => m.mes)) : "",
        entregas,
        total,
        porMes,
      };
    })
    .filter((l) => l.total > 0)
    .sort((a, b) => a.cooperado.localeCompare(b.cooperado, "pt-BR"));
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

function agregarItensLista(itens: NotaPedidoItem[]): LinhaItemEntregaRelatorio[] {
  const map = new Map<string, LinhaItemEntregaRelatorio>();
  for (const item of itens) {
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
  return [...map.values()].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
}

function agregarItensDasNotas(notas: NotaPedido[]): LinhaItemEntregaRelatorio[] {
  return agregarItensLista(notas.flatMap((n) => n.itens ?? []));
}

function cooperadoIdsDasNotas(notas: NotaPedido[]): string[] {
  const ids = new Set<string>();
  for (const nota of notas) {
    const participantes = nota.divisaoEntrega?.participantes;
    if (participantes && participantes.length > 1) {
      for (const p of participantes) ids.add(p.cooperadoId);
    } else {
      ids.add(nota.cooperadoId);
    }
  }
  return [...ids];
}

function listarFichasPendentesInstituicaoMes(
  data: AppData,
  instituicaoId: string,
  mesReferencia: string,
  cooperativaId?: string
): FichaCorrida[] {
  const notaById = new Map(data.notasPedido.map((n) => [n.id, n]));
  const fichas: FichaCorrida[] = [];
  for (const c of data.cooperados) {
    if (c.status !== "ativo") continue;
    if (cooperativaId && c.cooperativaId !== cooperativaId) continue;
    for (const f of listarFichasPendentesPagamento(data, c.id, mesReferencia, cooperativaId)) {
      const nota = notaById.get(f.notaPedidoId);
      if (nota?.instituicaoId === instituicaoId) fichas.push(f);
    }
  }
  return fichas;
}

function montarRelatorioEntregasPorItensPendente(
  instituicaoId: string,
  mesesReferencia: string[],
  data: AppData,
  cooperativaId?: string
): RelatorioEntregasPorItens {
  const inst = data.instituicoes.find((i) => i.id === instituicaoId);
  const meses = [...new Set(mesesReferencia.filter(Boolean))].sort();
  const porCooperadoMap = new Map<string, LinhaCooperadoItensRelatorio>();
  const fichaIds = new Set<string>();
  let totalLiquido = 0;

  for (const mes of meses) {
    for (const ficha of listarFichasPendentesInstituicaoMes(data, instituicaoId, mes, cooperativaId)) {
      fichaIds.add(ficha.id);
      totalLiquido = round2(totalLiquido + ficha.valorLiquido);
      const cooperadoId = ficha.cooperadoId;
      let linha = porCooperadoMap.get(cooperadoId);
      if (!linha) {
        linha = {
          cooperadoId,
          cooperadoNome: getCooperadoNomeSafe(data, cooperadoId),
          quantidadeEntregas: 0,
          itens: [],
          totalBruto: 0,
        };
        porCooperadoMap.set(cooperadoId, linha);
      }
      linha.quantidadeEntregas += 1;
      linha.totalBruto = round2(linha.totalBruto + ficha.valorBruto);
      linha.itens = consolidarLinhasItensRelatorio([
        ...linha.itens,
        ...agregarItensLista(ficha.itens ?? []),
      ]);
    }
  }

  const porCooperado = [...porCooperadoMap.values()].sort((a, b) =>
    a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR")
  );
  const itens = consolidarLinhasItensRelatorio(porCooperado.flatMap((l) => l.itens));
  const totalItens = round2(itens.reduce((s, i) => s + i.valorTotal, 0));

  const totalCooperadosBruto = round2(porCooperado.reduce((s, l) => s + l.totalBruto, 0));

  return {
    mesReferencia: meses.length === 1 ? meses[0] : "periodo",
    instituicao: inst,
    instituicaoNome: inst?.nome ?? "Instituição",
    itens,
    porCooperado,
    quantidadeEntregas: fichaIds.size,
    totalBruto: totalCooperadosBruto > 0 ? totalCooperadosBruto : totalItens,
    totalLiquido,
  };
}

function consolidarLinhasItensRelatorio(linhas: LinhaItemEntregaRelatorio[]): LinhaItemEntregaRelatorio[] {
  const map = new Map<string, LinhaItemEntregaRelatorio>();
  for (const item of linhas) {
    const key = chaveItemRelatorio(item);
    const cur = map.get(key);
    if (cur) {
      cur.quantidade = round2(cur.quantidade + item.quantidade);
      cur.valorTotal = round2(cur.valorTotal + item.valorTotal);
      cur.precoUnitario =
        cur.quantidade > 0 ? round2(cur.valorTotal / cur.quantidade) : cur.precoUnitario;
    } else {
      map.set(key, { ...item });
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
  return getRelatorioEntregasPorItensPeriodo(instituicaoId, [mesReferencia], data, cooperativaId);
}

/** Entregas por item — um ou vários meses selecionados, com filtro opcional de pendência. */
export function getRelatorioEntregasPorItensPeriodo(
  instituicaoId: string,
  mesesReferencia: string[],
  data: AppData,
  cooperativaId?: string,
  opcoes?: OpcoesRelatorioEntregasPorItens
): RelatorioEntregasPorItensPeriodo {
  const inst = data.instituicoes.find((i) => i.id === instituicaoId);
  const meses = [...new Set(mesesReferencia.filter(Boolean))].sort();
  const apenasPendente = opcoes?.apenasPendente ?? true;

  if (apenasPendente) {
    const mesesEfetivos =
      meses.length > 0 ? meses : listarMesesComDebitoCooperativa(data, cooperativaId);
    const base = montarRelatorioEntregasPorItensPendente(
      instituicaoId,
      mesesEfetivos,
      data,
      cooperativaId
    );
    return {
      ...base,
      mesReferencia: base.mesReferencia,
      meses: mesesEfetivos,
      mesesLabel: mesesEfetivos.length ? formatMesesReferenciaRotulo(mesesEfetivos) : "—",
      apenasPendente: true,
    };
  }

  const notasMap = new Map<string, NotaPedido>();

  for (const mes of meses) {
    const notasMes = notasConferidasOuPagas(data, mes).filter(
      (n) =>
        n.instituicaoId === instituicaoId &&
        (!cooperativaId || n.cooperativaId === cooperativaId) &&
        (!apenasPendente || notaTemCooperadoComDebitoNoMes(data, n, mes, cooperativaId))
    );
    for (const n of notasMes) notasMap.set(n.id, n);
  }

  const notas = [...notasMap.values()];
  const mesRef = meses.length === 1 ? meses[0] : "periodo";
  const base = montarRelatorioEntregasPorItens(mesRef, inst, notas, data, cooperativaId);

  return {
    ...base,
    mesReferencia: mesRef,
    meses,
    mesesLabel: meses.length ? formatMesesReferenciaRotulo(meses) : "—",
    apenasPendente,
  };
}

/** Meses distintos com débito pendente de pagamento a cooperados. */
export function listarMesesComDebitoCooperativa(data: AppData, cooperativaId?: string): string[] {
  const set = new Set<string>();
  for (const c of data.cooperados) {
    if (c.status !== "ativo") continue;
    if (cooperativaId && c.cooperativaId !== cooperativaId) continue;
    for (const mes of listarMesesPendentesPagamentoResponsavel(data, c.id, cooperativaId)) {
      set.add(mes);
    }
  }
  return [...set].sort();
}

function notaTemCooperadoComDebitoNoMes(
  data: AppData,
  nota: NotaPedido,
  mes: string,
  cooperativaId?: string
): boolean {
  for (const cooperadoId of cooperadoIdsDasNotas([nota])) {
    if (getPagamentoAguardandoCooperado(data, cooperadoId, mes)) return true;
    if (getTotalAPagarCooperado(data, cooperadoId, mes, cooperativaId) > 0) return true;
  }
  return false;
}

function montarRelatorioEntregasPorItens(
  mesReferencia: string,
  inst: Instituicao | undefined,
  notas: NotaPedido[],
  data: AppData,
  cooperativaId?: string
): RelatorioEntregasPorItens {
  const porCooperado: LinhaCooperadoItensRelatorio[] = cooperadoIdsDasNotas(notas)
    .map((cooperadoId) => {
      const notasCoop = notas.filter((n) =>
        notaPertenceCooperado(data, n, cooperadoId, cooperativaId)
      );
      const itensCoop = agregarItensLista(
        agregarItensNotasCooperado(data, cooperadoId, notasCoop, cooperativaId)
      );
      return {
        cooperadoId,
        cooperadoNome: getCooperadoNomeSafe(data, cooperadoId),
        quantidadeEntregas: new Set(notasCoop.map((n) => n.id)).size,
        itens: itensCoop,
        totalBruto: round2(itensCoop.reduce((s, i) => s + i.valorTotal, 0)),
      };
    })
    .filter((l) => l.itens.length > 0 || l.quantidadeEntregas > 0)
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  const itens = consolidarLinhasItensRelatorio(porCooperado.flatMap((l) => l.itens));
  const totalItens = round2(itens.reduce((s, i) => s + i.valorTotal, 0));
  const totalCooperados = round2(porCooperado.reduce((s, l) => s + l.totalBruto, 0));

  return {
    mesReferencia,
    instituicao: inst,
    instituicaoNome: inst?.nome ?? "Instituição",
    itens,
    porCooperado,
    quantidadeEntregas: notas.length,
    totalBruto:
      totalItens > 0 ? totalItens : totalCooperados > 0 ? totalCooperados : sumBy(notas, (n) => n.valorBruto),
    totalLiquido: sumBy(notas, (n) => n.valorLiquido),
  };
}

/** Resumo financeiro consolidado — soma todos os meses com débito pendente. */
export function getRelatorioResumoFinanceiroEmAberto(
  data: AppData,
  cooperativaId?: string
): ResumoFinanceiroEmAberto {
  const meses = listarMesesComDebitoCooperativa(data, cooperativaId);
  const linhasAberto = getRelatorioPagarCooperadoEmAberto(data, cooperativaId);
  let totalEntregas = 0;
  let totalVendasBruto = 0;
  let totalVendasLiquido = 0;
  let entregasAguardando = 0;

  for (const mes of meses) {
    const r = getResumoFinanceiroMes(mes, data);
    totalEntregas += r.totalEntregas;
    totalVendasBruto = round2(totalVendasBruto + r.totalVendasBruto);
    totalVendasLiquido = round2(totalVendasLiquido + r.totalVendasLiquido);
    entregasAguardando += r.entregasAguardando;
  }

  const valoresAPagar = getTotalValoresAPagarEmAberto(data, cooperativaId);

  return {
    meses,
    mesesLabel: meses.length ? formatMesesReferenciaRotulo(meses) : "—",
    totalEntregas,
    totalVendasBruto,
    totalVendasLiquido,
    valoresAPagar,
    cooperadosComDebito: linhasAberto.length,
    entregasAguardando,
  };
}

/** Mensalidades não pagas — todos os meses (consolidado). */
export function getRelatorioMensalidadesEmAbertoConsolidado(
  data: AppData,
  cooperativaId?: string
): { linhas: LinhaMensalidadeAberta[]; total: number } {
  const linhas = data.mensalidades
    .filter((m) => {
      if (m.status === "paga") return false;
      if (!cooperativaId) return true;
      const coop = data.cooperados.find((c) => c.id === m.cooperadoId);
      return coop?.cooperativaId === cooperativaId;
    })
    .map((m) => ({
      id: m.id,
      cooperadoId: m.cooperadoId,
      cooperadoNome: getCooperadoNomeSafe(data, m.cooperadoId),
      mesReferencia: m.mesReferencia,
      valor: m.valor,
      vencimento: m.vencimento,
      status: m.status,
    }))
    .sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia) || a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  return { linhas, total: round2(linhas.reduce((s, l) => s + l.valor, 0)) };
}

/** Entregas por item — total pendente (meses com débito), por instituição. */
export function getRelatorioEntregasPorItensEmAberto(
  instituicaoId: string,
  data: AppData,
  cooperativaId?: string
): RelatorioEntregasPorItensEmAberto {
  const meses = listarMesesComDebitoCooperativa(data, cooperativaId);
  const base = getRelatorioEntregasPorItensPeriodo(instituicaoId, meses, data, cooperativaId, {
    apenasPendente: true,
  });
  return {
    ...base,
    mesReferencia: "consolidado",
    escopo: "pendente",
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
