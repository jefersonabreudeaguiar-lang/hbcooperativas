import type { AppData, LivroCaixaLancamento, LivroCaixaOrigem, LivroCaixaTipo, Mensalidade, PagamentoCooperadoRegistro } from "@/types";
import { getCurrentMesReferencia } from "@/utils/format";

export interface ResumoLivroCaixa {
  saldo: number;
  totalCreditos: number;
  totalDebitos: number;
  lancamentos: LivroCaixaLancamento[];
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
  for (const l of lancamentos) {
    if (l.tipo === "credito") totalCreditos += l.valor;
    else totalDebitos += l.valor;
  }
  return { saldo: totalCreditos - totalDebitos, totalCreditos, totalDebitos, lancamentos };
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

export function lancarPagamentoCooperadoNoCaixa(data: AppData, pagamento: PagamentoCooperadoRegistro): AppData {
  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  return appendLivroCaixaLancamento(data, {
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
}

export function lancarMensalidadeNoCaixa(data: AppData, mensalidade: Mensalidade): AppData {
  const cooperado = data.cooperados.find((c) => c.id === mensalidade.cooperadoId);
  return appendLivroCaixaLancamento(data, {
    cooperativaId: cooperado?.cooperativaId ?? "",
    data: mensalidade.dataPagamento ?? new Date().toISOString().split("T")[0],
    mesReferencia: mensalidade.mesReferencia,
    tipo: "credito",
    valor: mensalidade.valor,
    historico: `Mensalidade ${cooperado?.nomeCompleto ?? ""} · ${mensalidade.mesReferencia}`,
    origem: "mensalidade",
    origemId: `mens_caixa_${mensalidade.id}`,
  });
}

export function mesesLivroCaixa(data: AppData, cooperativaId: string): string[] {
  const set = new Set((data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId).map((l) => l.mesReferencia));
  set.add(getCurrentMesReferencia());
  return [...set].sort().reverse();
}
