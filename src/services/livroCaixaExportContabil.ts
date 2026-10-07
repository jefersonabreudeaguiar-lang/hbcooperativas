import type { AppData, LivroCaixaLancamento, LivroCaixaOrigem, PagamentoCooperadoRegistro } from "@/types";
import { round2 } from "@/utils/calculations";
import { formatMesReferencia, formatDate } from "@/utils/format";
import {
  auditarLivroCaixaContabilCooperativa,
  getControleAnualLivroCaixa,
  isOrigemRetencaoContabil,
  lancamentosLivroCaixa,
  lancamentosLivroCaixaPorData,
  pagamentoIdFromOrigemId,
  resumoLivroCaixa,
} from "@/services/livroCaixaService";
import {
  buildPlanilhaLinhas,
  lancamentosLivroCaixaPeriodo,
  saldoLivroCaixaAntesData,
  saldoLivroCaixaAntesMes,
} from "@/services/livroCaixaPlanilha";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";
import type { LivroCaixaRelatorioPlanilhaOpts } from "@/utils/livroCaixaRelatorioHtml";

export type LivroCaixaNaturezaMovimento = "movimento_caixa" | "retencao_ficha";

const ORIGEM_LABELS: Record<LivroCaixaOrigem, string> = {
  manual: "Manual",
  mensalidade: "Mensalidade (PIX)",
  mensalidade_ficha: "Mensalidade na ficha",
  taxa_cooperativa: "Taxa cooperativa (5%)",
  desconto_ficha: "Desconto retido na ficha",
  pagamento_cooperado: "Pagamento cooperado",
  credito_avulso: "Crédito avulso",
  debito_avulso: "Débito avulso",
  pnae: "PNAE / contrato",
  prestacao_contas: "Prestação de contas",
  hb_app_repasse: "Repasse HB Créditos",
  outro: "Outro",
};

/** Contas ilustrativas — o contador deve validar no plano da cooperativa. */
export const MAPEAMENTO_ORIGEM_CONTA: {
  origem: LivroCaixaOrigem;
  tipoLivro: string;
  contaDebitoSugerida: string;
  contaCreditoSugerida: string;
  notas: string;
}[] = [
  {
    origem: "pagamento_cooperado",
    tipoLivro: "Débito",
    contaDebitoSugerida: "3.x — Aquisição produtos cooperados / fornecedores",
    contaCreditoSugerida: "1.x — Banco / caixa",
    notas: "Valor líquido do PIX ao cooperado",
  },
  {
    origem: "taxa_cooperativa",
    tipoLivro: "Crédito (retenção)",
    contaDebitoSugerida: "—",
    contaCreditoSugerida: "4.x — Receita taxa administrativa",
    notas: "Não é depósito bancário; retenção na ficha",
  },
  {
    origem: "mensalidade_ficha",
    tipoLivro: "Crédito (retenção)",
    contaDebitoSugerida: "—",
    contaCreditoSugerida: "4.x — Receita serviços associados",
    notas: "Mensalidade app retida no pagamento da ficha",
  },
  {
    origem: "desconto_ficha",
    tipoLivro: "Crédito (retenção)",
    contaDebitoSugerida: "—",
    contaCreditoSugerida: "2.x — Obrigações HB / compensação",
    notas: "Inclui HB Créditos (mercado) e demais descontos",
  },
  {
    origem: "mensalidade",
    tipoLivro: "Crédito (caixa)",
    contaDebitoSugerida: "1.x — Banco / caixa",
    contaCreditoSugerida: "4.x — Receita mensalidade",
    notas: "PIX de mensalidade recebido",
  },
  {
    origem: "hb_app_repasse",
    tipoLivro: "Débito",
    contaDebitoSugerida: "3.x — Despesa serviços plataforma HB",
    contaCreditoSugerida: "1.x — Banco / caixa",
    notas: "Repasse taxa app sobre HB Créditos",
  },
  {
    origem: "pnae",
    tipoLivro: "Conforme manual",
    contaDebitoSugerida: "Conforme contrato PNAE",
    contaCreditoSugerida: "Conforme contrato PNAE",
    notas: "Lançamento manual — anexar documento",
  },
  {
    origem: "credito_avulso",
    tipoLivro: "Crédito",
    contaDebitoSugerida: "1.x — Banco",
    contaCreditoSugerida: "A definir",
    notas: "Lançamento manual",
  },
  {
    origem: "debito_avulso",
    tipoLivro: "Débito",
    contaDebitoSugerida: "A definir",
    contaCreditoSugerida: "1.x — Banco",
    notas: "Lançamento manual",
  },
  {
    origem: "manual",
    tipoLivro: "Variável",
    contaDebitoSugerida: "A definir",
    contaCreditoSugerida: "A definir",
    notas: "Lançamento manual",
  },
  {
    origem: "prestacao_contas",
    tipoLivro: "Variável",
    contaDebitoSugerida: "A definir",
    contaCreditoSugerida: "A definir",
    notas: "Prestação de contas",
  },
  {
    origem: "outro",
    tipoLivro: "Variável",
    contaDebitoSugerida: "A definir",
    contaCreditoSugerida: "A definir",
    notas: "Outro",
  },
];

export function naturezaMovimentoLivroCaixa(origem: LivroCaixaOrigem): LivroCaixaNaturezaMovimento {
  if (isOrigemRetencaoContabil(origem)) return "retencao_ficha";
  return "movimento_caixa";
}

function mapeamentoContaParaOrigem(origem: LivroCaixaOrigem) {
  return MAPEAMENTO_ORIGEM_CONTA.find((m) => m.origem === origem);
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowCsv(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(";");
}

function sheetCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [rowCsv(headers), ...rows.map((r) => rowCsv(r))];
  return `\uFEFF${lines.join("\r\n")}`;
}

function resolvePagamento(data: AppData, pagamentoId: string | null): PagamentoCooperadoRegistro | undefined {
  if (!pagamentoId) return undefined;
  return data.pagamentosCooperado.find((p) => p.id === pagamentoId);
}

function resolveCooperadoFromPagamento(data: AppData, pagamento?: PagamentoCooperadoRegistro) {
  if (!pagamento) return { nome: "", cpf: "" };
  const c = data.cooperados.find((x) => x.id === pagamento.cooperadoId);
  return { nome: c?.nomeCompleto?.trim() ?? "", cpf: c?.cpfCnpj?.trim() ?? "" };
}

function resolveCooperadoFromLancamento(data: AppData, l: LivroCaixaLancamento) {
  const pgId = pagamentoIdFromOrigemId(l.origemId);
  const pg = resolvePagamento(data, pgId);
  if (pg) return resolveCooperadoFromPagamento(data, pg);
  const parts = l.historico.split("·").map((p) => p.trim());
  const last = parts[parts.length - 1];
  if (last) {
    const coop = data.cooperados.find(
      (c) => c.cooperativaId === l.cooperativaId && c.nomeCompleto.trim() === last
    );
    if (coop) return { nome: coop.nomeCompleto, cpf: coop.cpfCnpj };
  }
  return { nome: "", cpf: "" };
}

function eventoKey(l: LivroCaixaLancamento): string {
  if (l.grupoEventoId) return l.grupoEventoId;
  if (l.numeroSequencia != null) return `seq_${l.anoSequencia ?? ""}_${l.numeroSequencia}`;
  return `solo_${l.id}`;
}

export type LivroCaixaPacoteContabil = {
  periodoLabel: string;
  files: { name: string; content: string }[];
};

export function resolverLancamentosExport(
  data: AppData,
  cooperativaId: string,
  opts: LivroCaixaRelatorioPlanilhaOpts
): { lancamentos: LivroCaixaLancamento[]; saldoInicial: number; periodoLabel: string } {
  const mesAberto = new Date().toISOString().slice(0, 7);
  if (opts.modo === "dia" && opts.dataIso) {
    return {
      lancamentos: lancamentosLivroCaixaPorData(data, cooperativaId, opts.dataIso),
      saldoInicial: saldoLivroCaixaAntesData(data, cooperativaId, opts.dataIso),
      periodoLabel: `Dia ${formatDate(opts.dataIso)}`,
    };
  }
  if (opts.modo === "periodo" && opts.dataDe && opts.dataAte) {
    return {
      lancamentos: lancamentosLivroCaixaPeriodo(data, cooperativaId, opts.dataDe, opts.dataAte),
      saldoInicial: saldoLivroCaixaAntesData(data, cooperativaId, opts.dataDe),
      periodoLabel: `${formatDate(opts.dataDe)} a ${formatDate(opts.dataAte)}`,
    };
  }
  const mes = opts.mesReferencia ?? mesAberto;
  let lancamentos = lancamentosLivroCaixa(data, cooperativaId, mes);
  if (opts.somenteMesEmAberto) {
    lancamentos = lancamentos.filter((l) => l.mesReferencia === mesAberto);
  }
  return {
    lancamentos,
    saldoInicial: saldoLivroCaixaAntesMes(data, cooperativaId, mes),
    periodoLabel: `Mês ${formatMesReferencia(mes)}${opts.somenteMesEmAberto ? " (mês operacional em aberto)" : ""}`,
  };
}

/** Evita import circular — chamadores podem passar lancamentos já filtrados. */
export function buildLivroCaixaPacoteContabil(
  data: AppData,
  cooperativaId: string,
  cooperativaNome: string,
  cooperativaCnpj: string,
  opts: LivroCaixaRelatorioPlanilhaOpts,
  lancamentosOverride?: { lancamentos: LivroCaixaLancamento[]; saldoInicial: number; periodoLabel: string }
): LivroCaixaPacoteContabil {
  const { lancamentos, saldoInicial, periodoLabel } =
    lancamentosOverride ?? resolverLancamentosExport(data, cooperativaId, opts);

  const controle = getControleAnualLivroCaixa(data, cooperativaId);
  const anoLivro = controle?.anoLivro ?? new Date().getFullYear();
  const mesRef =
    opts.modo === "mes" && opts.mesReferencia
      ? opts.mesReferencia
      : lancamentos[0]?.mesReferencia ?? new Date().toISOString().slice(0, 7);

  const resumoMes = resumoLivroCaixa(data, cooperativaId, opts.modo === "mes" ? opts.mesReferencia : undefined);
  const linhasPlan = buildPlanilhaLinhas(lancamentos, saldoInicial);
  const saldoFinal = linhasPlan.length ? linhasPlan[linhasPlan.length - 1].saldoCorrido : saldoInicial;

  const creditosPeriodo = round2(lancamentos.filter((l) => l.tipo === "credito").reduce((s, l) => s + l.valor, 0));
  const debitosPeriodo = round2(lancamentos.filter((l) => l.tipo === "debito").reduce((s, l) => s + l.valor, 0));
  const retencoesPeriodo = round2(
    lancamentos
      .filter((l) => l.tipo === "credito" && isOrigemRetencaoContabil(l.origem))
      .reduce((s, l) => s + l.valor, 0)
  );
  const saldoEfetivoFromResumo =
    opts.modo === "mes" && opts.mesReferencia
      ? resumoLivroCaixa(data, cooperativaId, opts.mesReferencia).saldoCaixaEfetivo
      : round2(saldoFinal - retencoesPeriodo);

  const capaRows: (string | number)[][] = [
    ["Cooperativa", cooperativaNome],
    ["CNPJ", cooperativaCnpj],
    ["Período exportado", periodoLabel],
    ["Ano-livro", anoLivro],
    ["Gerado em", new Date().toISOString()],
    ["Saldo inicial período (R$)", saldoInicial.toFixed(2)],
    ["Créditos período (R$)", creditosPeriodo.toFixed(2)],
    ["Débitos período (R$)", debitosPeriodo.toFixed(2)],
    ["Retenções ficha período (R$)", retencoesPeriodo.toFixed(2)],
    ["Saldo final corrido (R$)", saldoFinal.toFixed(2)],
    ["Saldo caixa efetivo referência (R$)", saldoEfetivoFromResumo.toFixed(2)],
    [
      "Observação",
      "Retenções (taxa, mensalidade e descontos na ficha) não são entrada bancária; use a coluna Natureza na aba LIVRO_CAIXA.",
    ],
  ];
  const capaCsv = sheetCsv(["Campo", "Valor"], capaRows);

  const livroHeaders = [
    "Ano-livro",
    "Nº evento",
    "ID grupo evento",
    "Data",
    "Mês ref. ficha",
    "Histórico",
    "Origem sistema",
    "Natureza",
    "Crédito (R$)",
    "Débito (R$)",
    "Saldo corrido (R$)",
    "Cooperado",
    "CPF/CNPJ cooperado",
    "ID pagamento",
    "origemId",
    "Responsável",
    "Categoria",
    "Conta débito sugerida",
    "Conta crédito sugerida",
    "Centro custo sugerido",
    "Observações contador",
  ];

  const livroRows = linhasPlan.map(({ lancamento: l, credito, debito, saldoCorrido }) => {
    const coop = resolveCooperadoFromLancamento(data, l);
    const pgId = pagamentoIdFromOrigemId(l.origemId);
    const map = mapeamentoContaParaOrigem(l.origem);
    const centro =
      l.origem === "hb_app_repasse" || (l.origem === "desconto_ficha" && /hb|crédito/i.test(l.historico))
        ? "HB Créditos"
        : l.origem === "pagamento_cooperado" || isOrigemRetencaoContabil(l.origem)
          ? "PNAE / ficha"
          : "Administração";
    return [
      l.anoSequencia ?? anoLivro,
      l.numeroSequencia ?? "",
      l.grupoEventoId ?? "",
      l.data,
      l.mesReferencia,
      l.historico,
      ORIGEM_LABELS[l.origem],
      naturezaMovimentoLivroCaixa(l.origem) === "retencao_ficha" ? "Retenção ficha" : "Movimento caixa",
      credito != null ? credito.toFixed(2) : "",
      debito != null ? debito.toFixed(2) : "",
      saldoCorrido.toFixed(2),
      coop.nome,
      coop.cpf,
      pgId ?? "",
      l.origemId ?? "",
      l.responsavel ?? "",
      l.categoria ?? "",
      map?.contaDebitoSugerida ?? "",
      map?.contaCreditoSugerida ?? "",
      centro,
      "",
    ];
  });
  const livroCsv = sheetCsv(livroHeaders, livroRows);

  const grupos = new Map<string, LivroCaixaLancamento[]>();
  for (const l of lancamentos) {
    const key = eventoKey(l);
    const arr = grupos.get(key) ?? [];
    arr.push(l);
    grupos.set(key, arr);
  }

  const eventoHeaders = [
    "Nº evento",
    "Data",
    "ID pagamento",
    "Cooperado",
    "CPF/CNPJ",
    "Mês(es) ref. ficha",
    "Bruto entregas (R$)",
    "Taxa 5% (R$)",
    "Mensalidade ficha (R$)",
    "HB / conta_coop (R$)",
    "Outros descontos (R$)",
    "Total retenções (R$)",
    "Líquido pago (R$)",
    "Check bruto = líquido + retenções",
    "Soma linhas livro crédito retenção (R$)",
    "Soma linhas livro débito (R$)",
  ];

  const eventoRows: (string | number)[][] = [];
  for (const linhasEvt of grupos.values()) {
    const sorted = [...linhasEvt].sort((a, b) => (a.numeroSequencia ?? 0) - (b.numeroSequencia ?? 0));
    const ref = sorted[0];
    const pgId = pagamentoIdFromOrigemId(ref.origemId) ?? sorted.map((x) => pagamentoIdFromOrigemId(x.origemId)).find(Boolean);
    const pg = resolvePagamento(data, pgId ?? null);
    const coop = resolveCooperadoFromPagamento(data, pg) || resolveCooperadoFromLancamento(data, ref);

    const debitoPg = round2(
      sorted.filter((l) => l.origem === "pagamento_cooperado" && l.tipo === "debito").reduce((s, l) => s + l.valor, 0)
    );
    const taxaLivro = round2(
      sorted.filter((l) => l.origem === "taxa_cooperativa").reduce((s, l) => s + l.valor, 0)
    );
    const mensLivro = round2(
      sorted.filter((l) => l.origem === "mensalidade_ficha").reduce((s, l) => s + l.valor, 0)
    );
    const hbLivro = round2(
      sorted
        .filter((l) => l.origem === "desconto_ficha" && /hb|crédito|credito/i.test(l.historico))
        .reduce((s, l) => s + l.valor, 0)
    );
    const outrosLivro = round2(
      sorted
        .filter(
          (l) =>
            l.origem === "desconto_ficha" && !/hb|crédito|credito/i.test(l.historico)
        )
        .reduce((s, l) => s + l.valor, 0)
    );
    const retLivro = round2(taxaLivro + mensLivro + hbLivro + outrosLivro);

    const bruto = pg ? pg.valorBruto : round2(debitoPg + retLivro);
    const taxa = pg ? pg.descontoCooperativa : taxaLivro;
    const mens = pg
      ? round2((pg.descontosExtras ?? []).filter((d) => d.tipo === "mensalidade").reduce((s, d) => s + d.valor, 0))
      : mensLivro;
    const hb = pg
      ? round2((pg.descontosExtras ?? []).filter((d) => d.tipo === "conta_coop").reduce((s, d) => s + d.valor, 0))
      : hbLivro;
    const outros = pg
      ? round2(
          (pg.descontosExtras ?? [])
            .filter(
              (d) =>
                d.tipo !== "mensalidade" &&
                d.tipo !== "credito_avulso" &&
                d.tipo !== "cooperativa" &&
                d.tipo !== "conta_coop" &&
                d.valor > 0
            )
            .reduce((s, d) => s + d.valor, 0)
        )
      : outrosLivro;
    const retPg = round2(taxa + mens + hb + outros);
    const liquido = pg ? pg.valorLiquido : debitoPg;
    const check = Math.abs(bruto - round2(liquido + retPg)) < 0.02 ? "OK" : "Revisar";

    const refs =
      pg?.mesesReferencia?.length
        ? pg.mesesReferencia.map((m) => formatMesReferencia(m)).join(", ")
        : pg
          ? formatMesReferencia(pg.mesReferencia)
          : ref.mesReferencia;

    eventoRows.push([
      ref.numeroSequencia ?? "",
      ref.data,
      pgId ?? "",
      coop.nome,
      coop.cpf,
      refs,
      bruto.toFixed(2),
      taxa.toFixed(2),
      mens.toFixed(2),
      hb.toFixed(2),
      outros.toFixed(2),
      retPg.toFixed(2),
      liquido.toFixed(2),
      check,
      retLivro.toFixed(2),
      debitoPg.toFixed(2),
    ]);
  }
  eventoRows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const eventosCsv = sheetCsv(eventoHeaders, eventoRows);

  const taxaMes = round2(
    lancamentos.filter((l) => l.origem === "taxa_cooperativa").reduce((s, l) => s + l.valor, 0)
  );
  const mensMes = round2(
    lancamentos.filter((l) => l.origem === "mensalidade_ficha").reduce((s, l) => s + l.valor, 0)
  );
  const hbRetido = round2(
    lancamentos
      .filter((l) => l.origem === "desconto_ficha" && /hb|crédito|credito/i.test(l.historico))
      .reduce((s, l) => s + l.valor, 0)
  );
  const hbRepasse = round2(
    lancamentos.filter((l) => l.origem === "hb_app_repasse").reduce((s, l) => s + l.valor, 0)
  );
  const retencoesCsv = sheetCsv(
    ["Tipo", "Valor período (R$)", "Destino contábil sugerido"],
    [
      ["Taxa cooperativa 5%", taxaMes.toFixed(2), "Receita operacional / taxa de gestão"],
      ["Mensalidade retida na ficha", mensMes.toFixed(2), "Receita de serviços associados"],
      ["HB retido na ficha (mercado)", hbRetido.toFixed(2), "Passivo / compensação HB"],
      ["Repasse HB app (débito caixa)", hbRepasse.toFixed(2), "Despesa serviços de terceiros"],
    ]
  );

  const conciliacaoCsv = sheetCsv(
    ["Data", "Extrato banco (R$)", "Livro caixa efetivo (R$)", "Diferença (R$)", "Motivo / documento"],
    [
      [
        mesRef,
        "",
        saldoEfetivoFromResumo.toFixed(2),
        "",
        "Preencher com extrato bancário do período",
      ],
    ]
  );

  const auditoria = auditarLivroCaixaContabilCooperativa(data, cooperativaId);
  const pendRows: (string | number)[][] = [];
  for (const id of auditoria.pagamentosSemDebitoCaixa) {
    pendRows.push(["Pagamento sem débito no livro", id, "", ""]);
  }
  for (const id of auditoria.pagamentosSemTaxaCoopCaixa) {
    pendRows.push(["Pagamento sem taxa 5% no livro", id, "", ""]);
  }
  for (const id of auditoria.pagamentosSemMensalidadeFichaCaixa) {
    pendRows.push(["Pagamento sem mensalidade ficha no livro", id, "", ""]);
  }
  for (const id of auditoria.mensalidadesPagasSemCreditoCaixa) {
    pendRows.push(["Mensalidade PIX paga sem crédito no livro", id, "", ""]);
  }
  for (const c of listCooperadosDaCooperativa(data, cooperativaId)) {
    const meses = new Set<string>();
    for (const f of data.fichaCorrida ?? []) {
      if (f.cooperadoId === c.id && f.cooperativaId === cooperativaId) meses.add(f.mesReferencia);
    }
    for (const m of meses) {
      const valor = getTotalAPagarCooperado(data, c.id, m, cooperativaId);
      if (valor > 0) {
        pendRows.push(["A pagar cooperado (ficha)", c.nomeCompleto, m, valor.toFixed(2)]);
      }
    }
  }
  const pendenciasCsv = sheetCsv(
    ["Tipo", "Referência", "Mês / ID", "Valor (R$)"],
    pendRows.length ? pendRows : [["—", "Nenhuma pendência listada", "", ""]]
  );

  const mapaCsv = sheetCsv(
    ["origem", "Tipo no livro", "Conta débito sugerida", "Conta crédito sugerida", "Notas"],
    MAPEAMENTO_ORIGEM_CONTA.map((m) => [
      ORIGEM_LABELS[m.origem],
      m.tipoLivro,
      m.contaDebitoSugerida,
      m.contaCreditoSugerida,
      m.notas,
    ])
  );

  return {
    periodoLabel,
    files: [
      { name: "01_CAPA.csv", content: capaCsv },
      { name: "02_LIVRO_CAIXA.csv", content: livroCsv },
      { name: "03_EVENTOS_PAGAMENTO.csv", content: eventosCsv },
      { name: "04_RETENCOES_E_HB.csv", content: retencoesCsv },
      { name: "05_CONCILIACAO_BANCO.csv", content: conciliacaoCsv },
      { name: "06_PENDENCIAS.csv", content: pendenciasCsv },
      { name: "07_MAPEAMENTO_ORIGEM_CONTA.csv", content: mapaCsv },
    ],
  };
}

export function nomeZipPacoteContabil(cnpj: string, periodoSlug: string): string {
  const cnpjDigits = cnpj.replace(/\D/g, "").slice(0, 14) || "coop";
  return `livro_caixa_contabil_${cnpjDigits}_${periodoSlug}.zip`;
}
