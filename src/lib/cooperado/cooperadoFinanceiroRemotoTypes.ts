import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";

export type CooperadoFinanceiroRemoto = {
  cooperadoId: string;
  cooperativaId: string;
  fetchedAt: string;
  paridade: LeituraFinanceiraParidadeCooperado;
};
