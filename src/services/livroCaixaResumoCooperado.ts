import type { AppData, LivroCaixaLancamento } from "@/types";
import { round2 } from "@/utils/calculations";
import { pagamentoIdFromOrigemId } from "@/services/livroCaixaService";

export interface ResumoOperacionalLivroCaixa {
  /** Soma de todos os créditos do livro no período da visão */
  totalCreditos: number;
  /** Soma de todos os débitos do livro no período da visão */
  totalDebitos: number;
  /** Créditos − débitos (mesmo período) */
  saldo: number;
}

export interface ResumoCooperadoLivroCaixaLinha {
  cooperadoId: string;
  nome: string;
  creditoTaxa: number;
  creditoMensalidade: number;
  debitoPagamento: number;
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
