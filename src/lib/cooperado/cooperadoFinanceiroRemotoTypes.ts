import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";

export type CooperadoHistoricoPagamentos = {
  totalRecebido: number;
  pagamentos: { id: string; meses: string[]; pagoEm: string; valorBruto: number;
    descontoCooperativa: number; descontos: { descricao: string; valor: number }[]; valorRecebido: number }[];
};

export type CooperadoFinanceiroRemoto = {
  cooperadoId: string;
  cooperativaId: string;
  fetchedAt: string;
  paridade: LeituraFinanceiraParidadeCooperado;
  historicoPagamentos?: CooperadoHistoricoPagamentos;
};
