import type { AppData, LivroCaixaLancamento, PagamentoCooperadoRegistro } from "@/types";
import { round2 } from "@/utils/calculations";
import {
  hidratarPagamentoParaLivroCaixa,
  isOrigemRetencaoContabil,
  pagamentoIdFromOrigemId,
  resolverDataIsoLancamentoLivroCaixa,
} from "@/services/livroCaixaService";
import { ordenarLancamentosPlanilha } from "@/services/livroCaixaPlanilha";
import { getMesesReferenciaPagamento } from "@/services/notaPedidoService";

export interface ResumoOperacionalLivroCaixa {
  /** Soma de todos os créditos do livro no período da visão */
  totalCreditos: number;
  /** Soma de todos os débitos do livro no período da visão */
  totalDebitos: number;
  /** Créditos − débitos (mesmo período) */
  saldo: number;
}

export interface PagamentoDetalheLivroCooperado {
  pagamentoId: string;
  pagoEm: string;
  mesReferencia: string;
  mesesLabel: string;
  valorBruto: number;
  valorLiquido: number;
  creditoTaxa: number;
  creditoMensalidade: number;
  creditoOutros: number;
}

export interface EntradaLivroCooperadoLinha {
  dataIso: string;
  tipo: "credito" | "debito";
  origem: string;
  historico: string;
  valor: number;
}

export interface ResumoCooperadoLivroCaixaLinha {
  cooperadoId: string;
  nome: string;
  totalBruto: number;
  creditoTaxa: number;
  creditoMensalidade: number;
  creditoOutros: number;
  debitoPagamento: number;
  pagamentos: PagamentoDetalheLivroCooperado[];
  entradas: EntradaLivroCooperadoLinha[];
}

const ORIGEM_ENTRADA_LABEL: Record<string, string> = {
  taxa_cooperativa: "Taxa cooperativa",
  mensalidade_ficha: "Mensalidade na ficha",
  mensalidade: "Mensalidade (PIX)",
  desconto_ficha: "Desconto retido",
  pagamento_cooperado: "Pagamento PIX",
};

function cooperadoIdDoLancamento(data: AppData, l: LivroCaixaLancamento): string | null {
  const pgId = pagamentoIdFromOrigemId(l.origemId);
  if (pgId) {
    const p = data.pagamentosCooperado.find((x) => x.id === pgId);
    return p?.cooperadoId ?? null;
  }
  if (l.origemId?.startsWith("mens_caixa_")) {
    const mensId = l.origemId.slice("mens_caixa_".length);
    const m = data.mensalidades.find((x) => x.id === mensId);
    return m?.cooperadoId ?? null;
  }
  return null;
}

export function calcularResumoOperacionalLivroCaixa(
  lancamentos: LivroCaixaLancamento[]
): ResumoOperacionalLivroCaixa {
  let totalCreditos = 0;
  let totalDebitos = 0;
  for (const l of lancamentos) {
    if (l.tipo === "credito") totalCreditos += l.valor;
    else totalDebitos += l.valor;
  }
  totalCreditos = round2(totalCreditos);
  totalDebitos = round2(totalDebitos);
  return {
    totalCreditos,
    totalDebitos,
    saldo: round2(totalCreditos - totalDebitos),
  };
}

export function calcularResumoLiquidoLivroCaixa(
  pagamentos: readonly PagamentoCooperadoRegistro[],
  lancamentos: readonly LivroCaixaLancamento[],
  inicio: string,
  fim: string,
) {
  const pagamentosPorId = new Map(pagamentos.map((p) => [p.id, p]));
  let creditos = 0;
  let debitos = 0;
  let saldoAnterior = 0;
  let pagamentosSemLiquido = 0;
  for (const lancamento of lancamentos) {
    if (lancamento.data > fim || !lancamento.data || isOrigemRetencaoContabil(lancamento.origem)) continue;
    let valor = lancamento.valor;
    if (lancamento.origem === "pagamento_cooperado" && lancamento.tipo === "debito") {
      const id = pagamentoIdFromOrigemId(lancamento.origemId);
      const pagamento = id ? pagamentosPorId.get(id) : undefined;
      if (pagamento?.status === "confirmado" && pagamento.cooperativaId === lancamento.cooperativaId &&
          Number.isFinite(pagamento.valorLiquido) && pagamento.valorLiquido >= 0) {
        valor = pagamento.valorLiquido;
      } else {
        pagamentosSemLiquido++;
      }
    }
    const centavos = Math.round(valor * 100);
    if (lancamento.data < inicio) {
      saldoAnterior += lancamento.tipo === "credito" ? centavos : -centavos;
    } else if (lancamento.tipo === "credito") {
      creditos += centavos;
    } else {
      debitos += centavos;
    }
  }
  return {
    totalCreditos: creditos / 100,
    totalDebitos: debitos / 100,
    saldo: (saldoAnterior + creditos - debitos) / 100,
    pagamentosSemLiquido,
  };
}

export function calcularResumoPorCooperadoLivroCaixa(
  data: AppData,
  lancamentos: LivroCaixaLancamento[]
): ResumoCooperadoLivroCaixaLinha[] {
  const map = new Map<string, ResumoCooperadoLivroCaixaLinha>();

  for (const l of lancamentos) {
    const cooperadoId = cooperadoIdDoLancamento(data, l);
    if (!cooperadoId) continue;

    const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
    const nome = cooperado?.nomeCompleto?.trim() || "Cooperado";
    const row =
      map.get(cooperadoId) ??
      {
        cooperadoId,
        nome,
        totalBruto: 0,
        creditoTaxa: 0,
        creditoMensalidade: 0,
        creditoOutros: 0,
        debitoPagamento: 0,
        pagamentos: [],
        entradas: [],
      };

    if (l.tipo === "credito" && l.origem === "taxa_cooperativa") {
      row.creditoTaxa = round2(row.creditoTaxa + l.valor);
    }
    if (l.tipo === "credito" && (l.origem === "mensalidade_ficha" || l.origem === "mensalidade")) {
      row.creditoMensalidade = round2(row.creditoMensalidade + l.valor);
    }
    if (l.tipo === "credito" && l.origem === "desconto_ficha") {
      row.creditoOutros = round2(row.creditoOutros + l.valor);
    }
    if (l.tipo === "debito" && l.origem === "pagamento_cooperado") {
      row.debitoPagamento = round2(row.debitoPagamento + l.valor);
    }

    map.set(cooperadoId, row);
  }

  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function creditoMensalidadePagamento(p: PagamentoCooperadoRegistro): number {
  return round2(
    (p.descontosExtras ?? [])
      .filter((d) => d.tipo === "mensalidade" && d.valor > 0)
      .reduce((s, d) => s + d.valor, 0)
  );
}

function creditoOutrosPagamento(p: PagamentoCooperadoRegistro): number {
  return round2(
    (p.descontosExtras ?? [])
      .filter(
        (d) =>
          d.tipo !== "mensalidade" &&
          d.tipo !== "credito_avulso" &&
          d.tipo !== "cooperativa" &&
          d.valor > 0 &&
          !/\(estornada\)/i.test(d.motivo ?? "")
      )
      .reduce((s, d) => s + d.valor, 0)
  );
}

function pagamentoNoPeriodoLancamentos(
  pagamento: PagamentoCooperadoRegistro,
  lancamentos: LivroCaixaLancamento[]
): boolean {
  const pgId = pagamento.id;
  return lancamentos.some((l) => pagamentoIdFromOrigemId(l.origemId) === pgId);
}

/** Pagamentos confirmados no período da visão, com totais e créditos (taxa / mensalidade). */
export function listarPagamentosDetalheCooperadoNoPeriodo(
  data: AppData,
  cooperadoId: string,
  lancamentos: LivroCaixaLancamento[]
): PagamentoDetalheLivroCooperado[] {
  const linhas: PagamentoDetalheLivroCooperado[] = [];
  for (const p of data.pagamentosCooperado) {
    if (p.cooperadoId !== cooperadoId || p.status !== "confirmado") continue;
    if (!pagamentoNoPeriodoLancamentos(p, lancamentos)) continue;
    const meses = getMesesReferenciaPagamento(p);
    const hidratado = hidratarPagamentoParaLivroCaixa(data, p);
    linhas.push({
      pagamentoId: p.id,
      pagoEm: p.pagoEm ?? p.createdAt ?? "",
      mesReferencia: p.mesReferencia,
      mesesLabel: meses.join(", "),
      valorBruto: round2(hidratado.valorBruto),
      valorLiquido: round2(hidratado.valorLiquido),
      creditoTaxa: round2(Math.max(0, hidratado.descontoCooperativa ?? 0)),
      creditoMensalidade: creditoMensalidadePagamento(hidratado),
      creditoOutros: creditoOutrosPagamento(hidratado),
    });
  }
  return linhas.sort(
    (a, b) => new Date(b.pagoEm).getTime() - new Date(a.pagoEm).getTime()
  );
}

export function listarEntradasLivroCooperadoNoPeriodo(
  data: AppData,
  cooperadoId: string,
  lancamentos: LivroCaixaLancamento[]
): EntradaLivroCooperadoLinha[] {
  const entradas: EntradaLivroCooperadoLinha[] = [];
  for (const l of ordenarLancamentosPlanilha(lancamentos)) {
    if (cooperadoIdDoLancamento(data, l) !== cooperadoId) continue;
    entradas.push({
      dataIso: resolverDataIsoLancamentoLivroCaixa(l, data),
      tipo: l.tipo,
      origem: ORIGEM_ENTRADA_LABEL[l.origem] ?? l.origem,
      historico: (l.historico?.trim() || ORIGEM_ENTRADA_LABEL[l.origem]) ?? l.origem,
      valor: round2(l.valor),
    });
  }
  return entradas;
}

export function enriquecerResumoCooperadoComPagamentos(
  data: AppData,
  linhas: ResumoCooperadoLivroCaixaLinha[],
  lancamentos: LivroCaixaLancamento[]
): ResumoCooperadoLivroCaixaLinha[] {
  return linhas.map((row) => {
    const pagamentos = listarPagamentosDetalheCooperadoNoPeriodo(data, row.cooperadoId, lancamentos);
    const totalBruto = round2(
      pagamentos.reduce((s, p) => s + p.valorBruto, 0) ||
        row.debitoPagamento + row.creditoTaxa + row.creditoMensalidade + row.creditoOutros
    );
    return {
      ...row,
      totalBruto,
      pagamentos,
      entradas: listarEntradasLivroCooperadoNoPeriodo(data, row.cooperadoId, lancamentos),
    };
  });
}

/** Resumo por cooperado + pagamentos confirmados no período (mesmo sem linha atribuída no mapa). */
export function calcularResumoPorCooperadoLivroCaixaCompleto(
  data: AppData,
  lancamentos: LivroCaixaLancamento[],
  cooperativaId: string
): ResumoCooperadoLivroCaixaLinha[] {
  const byId = new Map(
    calcularResumoPorCooperadoLivroCaixa(data, lancamentos).map((r) => [r.cooperadoId, { ...r }])
  );
  for (const p of data.pagamentosCooperado) {
    if (p.cooperativaId !== cooperativaId || p.status !== "confirmado") continue;
    if (!pagamentoNoPeriodoLancamentos(p, lancamentos)) continue;
    if (byId.has(p.cooperadoId)) continue;
    const coop = data.cooperados.find((c) => c.id === p.cooperadoId);
    byId.set(p.cooperadoId, {
      cooperadoId: p.cooperadoId,
      nome: coop?.nomeCompleto?.trim() || "Cooperado",
      totalBruto: round2(p.valorBruto),
      creditoTaxa: round2(Math.max(0, p.descontoCooperativa ?? 0)),
      creditoMensalidade: creditoMensalidadePagamento(p),
      creditoOutros: creditoOutrosPagamento(p),
      debitoPagamento: round2(p.valorLiquido),
      pagamentos: [],
      entradas: [],
    });
  }
  return enriquecerResumoCooperadoComPagamentos(data, [...byId.values()], lancamentos);
}
