import type {
  AppData,
  FichaCorridaDesconto,
  LivroCaixaLancamento,
  LivroCaixaOrigem,
  LivroCaixaTipo,
  Mensalidade,
  PagamentoCooperadoRegistro,
} from "@/types";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { round2 } from "@/utils/calculations";
import { getCurrentMesReferencia } from "@/utils/format";

export interface ResumoLivroCaixa {
  saldo: number;
  /** Saldo considerando só movimentos de caixa efetivo (exclui retenções contábeis na ficha). */
  saldoCaixaEfetivo: number;
  totalCreditos: number;
  totalDebitos: number;
  /** Créditos de retenção (taxa coop, mensalidade abatida, outros descontos) — não são entrada de dinheiro. */
  totalCreditosRetencao: number;
  lancamentos: LivroCaixaLancamento[];
}

/** Origens que registram retenção contábil, não entrada efetiva de caixa. */
export const ORIGENS_RETENCAO_CONTABIL: LivroCaixaOrigem[] = [
  "taxa_cooperativa",
  "mensalidade_ficha",
  "desconto_ficha",
];

export function isOrigemRetencaoContabil(origem: LivroCaixaOrigem): boolean {
  return ORIGENS_RETENCAO_CONTABIL.includes(origem);
}

function mesFromData(dataIso: string): string {
  return dataIso.slice(0, 7);
}

export function lancamentosLivroCaixa(data: AppData, cooperativaId: string, mesReferencia?: string): LivroCaixaLancamento[] {
  let items = (data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId);
  if (mesReferencia) items = items.filter((l) => l.mesReferencia === mesReferencia);
  return items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime() || b.createdAt.localeCompare(a.createdAt));
}

export function resumoLivroCaixa(data: AppData, cooperativaId: string, mesReferencia?: string): ResumoLivroCaixa {
  const lancamentos = lancamentosLivroCaixa(data, cooperativaId, mesReferencia);
  let totalCreditos = 0;
  let totalDebitos = 0;
  let totalCreditosRetencao = 0;
  for (const l of lancamentos) {
    if (l.tipo === "credito") {
      totalCreditos += l.valor;
      if (isOrigemRetencaoContabil(l.origem)) totalCreditosRetencao += l.valor;
    } else {
      totalDebitos += l.valor;
    }
  }
  const saldo = totalCreditos - totalDebitos;
  return {
    saldo,
    saldoCaixaEfetivo: saldo - totalCreditosRetencao,
    totalCreditos,
    totalDebitos,
    totalCreditosRetencao,
    lancamentos,
  };
}

export function resumoLivroCaixaGeral(data: AppData, cooperativaId: string): ResumoLivroCaixa {
  return resumoLivroCaixa(data, cooperativaId);
}

function jaExistePorOrigem(data: AppData, origemId: string): boolean {
  return (data.livroCaixa ?? []).some((l) => l.origemId === origemId);
}

export function appendLivroCaixaLancamento(
  data: AppData,
  input: Omit<LivroCaixaLancamento, "id" | "createdAt" | "updatedAt"> & { id?: string }
): AppData {
  if (input.origemId && jaExistePorOrigem(data, input.origemId)) return data;
  const now = new Date().toISOString();
  const lancamento: LivroCaixaLancamento = {
    id: input.id ?? `lc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    mesReferencia: input.mesReferencia || mesFromData(input.data),
    createdAt: now,
    updatedAt: now,
  };
  return { ...data, livroCaixa: [...(data.livroCaixa ?? []), lancamento] };
}

export function criarLancamentoManual(
  data: AppData,
  cooperativaId: string,
  tipo: LivroCaixaTipo,
  valor: number,
  historico: string,
  opts?: { data?: string; origem?: LivroCaixaOrigem; categoria?: string; responsavel?: string }
): AppData {
  const dataLanc = opts?.data ?? new Date().toISOString().split("T")[0];
  const origem = opts?.origem ?? (tipo === "credito" ? "credito_avulso" : "debito_avulso");
  return appendLivroCaixaLancamento(data, {
    cooperativaId,
    data: dataLanc,
    mesReferencia: mesFromData(dataLanc),
    tipo,
    valor: Math.abs(valor),
    historico: historico.trim(),
    origem,
    categoria: opts?.categoria,
    responsavel: opts?.responsavel,
  });
}

function labelDescontoFicha(tipo: FichaCorridaDesconto["tipo"]): string {
  switch (tipo) {
    case "cota":
      return "Cota retida na ficha";
    case "conta_coop":
      return "Conta Coop retida na ficha";
    case "cooperativa":
      return "Desconto cooperativa na ficha";
    case "manual":
      return "Desconto retido na ficha";
    default:
      return "Desconto retido na ficha";
  }
}

/** Créditos contábeis de retenções no pagamento ao cooperado (taxa 5%, mensalidade abatida, etc.). */
export function lancarRetencoesPagamentoNoCaixa(data: AppData, pagamento: PagamentoCooperadoRegistro): AppData {
  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  const nome = cooperado?.nomeCompleto?.trim() || "Cooperado";
  const dataLanc = pagamento.pagoEm.split("T")[0];
  const base = {
    cooperativaId: pagamento.cooperativaId,
    data: dataLanc,
    mesReferencia: pagamento.mesReferencia,
    responsavel: pagamento.pagoPor,
  };

  let next = data;

  if (pagamento.descontoCooperativa > 0) {
    next = appendLivroCaixaLancamento(next, {
      ...base,
      tipo: "credito",
      valor: pagamento.descontoCooperativa,
      historico: `Taxa cooperativa (5%) · ${nome} · ${pagamento.mesReferencia}`,
      origem: "taxa_cooperativa",
      origemId: `pg_taxa_${pagamento.id}`,
    });
  }

  const mensalidades = (pagamento.descontosExtras ?? []).filter((d) => d.tipo === "mensalidade" && d.valor > 0);
  const totalMens = round2(mensalidades.reduce((s, d) => s + d.valor, 0));
  if (totalMens > 0) {
    next = appendLivroCaixaLancamento(next, {
      ...base,
      tipo: "credito",
      valor: totalMens,
      historico: `Mensalidade retida na ficha · ${nome} · ${pagamento.mesReferencia}`,
      origem: "mensalidade_ficha",
      origemId: `pg_mensficha_${pagamento.id}`,
    });
  }

  const outrosDescontos = (pagamento.descontosExtras ?? []).filter(
    (d) => d.tipo !== "mensalidade" && d.tipo !== "credito_avulso" && d.tipo !== "cooperativa" && d.valor > 0
  );
  outrosDescontos.forEach((d, i) => {
    next = appendLivroCaixaLancamento(next, {
      ...base,
      tipo: "credito",
      valor: d.valor,
      historico: `${labelDescontoFicha(d.tipo)} · ${d.motivo.trim() || pagamento.mesReferencia} · ${nome}`,
      origem: "desconto_ficha",
      origemId: `pg_desc_${pagamento.id}_${i}_${d.tipo}`,
    });
  });

  return next;
}

export function lancarPagamentoCooperadoNoCaixa(data: AppData, pagamento: PagamentoCooperadoRegistro): AppData {
  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  let next = appendLivroCaixaLancamento(data, {
    cooperativaId: pagamento.cooperativaId,
    data: pagamento.pagoEm.split("T")[0],
    mesReferencia: pagamento.mesReferencia,
    tipo: "debito",
    valor: pagamento.valorLiquido,
    historico: `Pagamento cooperado ${cooperado?.nomeCompleto ?? ""} · ${pagamento.mesReferencia}`,
    origem: "pagamento_cooperado",
    origemId: `pg_caixa_${pagamento.id}`,
    responsavel: pagamento.pagoPor,
  });
  next = lancarRetencoesPagamentoNoCaixa(next, pagamento);
  return next;
}

export function lancarMensalidadeNoCaixa(data: AppData, mensalidade: Mensalidade): AppData {
  const cooperado = data.cooperados.find((c) => c.id === mensalidade.cooperadoId);
  return appendLivroCaixaLancamento(data, {
    cooperativaId: cooperado?.cooperativaId ?? "",
    data: mensalidade.dataPagamento ?? new Date().toISOString().split("T")[0],
    mesReferencia: mensalidade.mesReferencia,
    tipo: "credito",
    valor: mensalidade.valor,
    historico: `Mensalidade (PIX) ${cooperado?.nomeCompleto ?? ""} · ${mensalidade.mesReferencia}`,
    origem: "mensalidade",
    origemId: `mens_caixa_${mensalidade.id}`,
  });
}

/** Débito no caixa ao confirmar repasse HB dos 30% Conta Coop (idempotente por origemId). */
export function lancarRepasseHbContaCoopNoCaixa(
  data: AppData,
  input: {
    cooperativaId: string;
    mesReferencia: string;
    valorReais: number;
    origemId: string;
    responsavel?: string;
    paidAt?: string;
  }
): AppData {
  const dataLanc = (input.paidAt ?? new Date().toISOString()).split("T")[0];
  const [ano, mesNum] = input.mesReferencia.split("-");
  const mesCurto = mesNum && ano ? `${mesNum.padStart(2, "0")}/${ano}` : input.mesReferencia;
  return appendLivroCaixaLancamento(data, {
    cooperativaId: input.cooperativaId,
    data: dataLanc,
    mesReferencia: input.mesReferencia,
    tipo: "debito",
    valor: round2(input.valorReais),
    historico: `Repasse HB · taxa Conta Coop ${CONTA_COOP_DESCONTO_SPLIT.appPercent}% · ${mesCurto}`,
    origem: "hb_app_repasse",
    origemId: input.origemId,
    categoria: "Conta Coop",
    responsavel: input.responsavel,
  });
}

/** Preenche retenções contábeis em pagamentos antigos que só tinham o débito líquido. */
export function completarLancamentosContabeisPagamentos(data: AppData, cooperativaId?: string): AppData {
  let next = data;
  const pagamentos = data.pagamentosCooperado.filter((p) => !cooperativaId || p.cooperativaId === cooperativaId);
  for (const pagamento of pagamentos) {
    const atualizado = lancarRetencoesPagamentoNoCaixa(next, pagamento);
    if (atualizado !== next) next = atualizado;
  }
  return next;
}

export function mesesLivroCaixa(data: AppData, cooperativaId: string): string[] {
  const set = new Set((data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId).map((l) => l.mesReferencia));
  set.add(getCurrentMesReferencia());
  return [...set].sort().reverse();
}
