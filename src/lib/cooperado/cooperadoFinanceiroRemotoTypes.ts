import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import type { agregarItensFichaMes } from "@/services/notaPedidoService";

export type CooperadoHistoricoPagamentos = {
  totalRecebido: number;
  pagamentos: { id: string; meses: string[]; pagoEm: string; valorBruto: number;
    descontoCooperativa: number; descontos: { descricao: string; valor: number }[]; valorRecebido: number;
    fichaIds?: string[]; notaPedidoIds?: string[] }[];
};

export type CooperadoFinanceiroRemoto = {
  sessionUserId?: string;
  cooperadoId: string;
  cooperativaId: string;
  fetchedAt: string;
  paridade: LeituraFinanceiraParidadeCooperado;
  historicoPagamentos?: CooperadoHistoricoPagamentos;
  entregasPorMes?: (ReturnType<typeof agregarItensFichaMes> & { mes: string })[];
};
