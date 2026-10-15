import type { AppData, LivroCaixaLancamento, PagamentoCooperadoRegistro } from "@/types";
import { round2 } from "@/utils/calculations";
import { pagamentoIdFromOrigemId } from "@/services/livroCaixaService";
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

export interface ResumoCooperadoLivroCaixaLinha {
  cooperadoId: string;
  nome: string;
  creditoTaxa: number;
  creditoMensalidade: number;
  debitoPagamento: number;
  pagamentos: PagamentoDetalheLivroCooperado[];
}

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
        creditoTaxa: 0,
        creditoMensalidade: 0,
        debitoPagamento: 0,
        pagamentos: [],
      };

    if (l.tipo === "credito" && l.origem === "taxa_cooperativa") {
      row.creditoTaxa = round2(row.creditoTaxa + l.valor);
    }
    if (
      l.tipo === "credito" &&
      (l.origem === "mensalidade_ficha" || l.origem === "mensalidade" || l.origem === "desconto_ficha")
    ) {
      row.creditoMensalidade = round2(row.creditoMensalidade + l.valor);
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
    linhas.push({
      pagamentoId: p.id,
      pagoEm: p.pagoEm ?? p.createdAt ?? "",
      mesReferencia: p.mesReferencia,
      mesesLabel: meses.join(", "),
      valorBruto: round2(p.valorBruto),
      valorLiquido: round2(p.valorLiquido),
      creditoTaxa: round2(Math.max(0, p.descontoCooperativa ?? 0)),
      creditoMensalidade: creditoMensalidadePagamento(p),
      creditoOutros: creditoOutrosPagamento(p),
    });
  }
  return linhas.sort(
    (a, b) => new Date(b.pagoEm).getTime() - new Date(a.pagoEm).getTime()
  );
}

export function enriquecerResumoCooperadoComPagamentos(
  data: AppData,
  linhas: ResumoCooperadoLivroCaixaLinha[],
  lancamentos: LivroCaixaLancamento[]
): ResumoCooperadoLivroCaixaLinha[] {
  return linhas.map((row) => ({
    ...row,
    pagamentos: listarPagamentosDetalheCooperadoNoPeriodo(data, row.cooperadoId, lancamentos),
  }));
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
      creditoTaxa: round2(Math.max(0, p.descontoCooperativa ?? 0)),
      creditoMensalidade: creditoMensalidadePagamento(p),
      debitoPagamento: round2(p.valorLiquido),
      pagamentos: [],
    });
  }
  return enriquecerResumoCooperadoComPagamentos(data, [...byId.values()], lancamentos);
}
