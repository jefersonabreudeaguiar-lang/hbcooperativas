/**
 * Modelo 621 — Início “A receber” = mesma paridade BIC do Financeiro (cirúrgico).
 */
import type { AppData } from "@/types";
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import {
  aplicarDebitoHbHibridoNaParidade,
  linhasOverlayDebitoHbAReceber,
} from "@/lib/hb-credit/hbAReceberHibrido";
import { inicioCardMotorFromParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import type { InicioCardMotorSnapshot } from "@/lib/cooperado/cooperadoInicioCardMotorTypes";
import { cooperadoMotorRevisionOperacional } from "@/lib/cooperado/cooperadoMotorRevisionOperacional";

export function cooperadoInicioSincronizadoComFinanceiro(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  return isCooperadoMobileGaPromoted(user);
}

export function cooperadoCardInicioMotorParidadeFinanceiro(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  apresentacaoConsolidada?: boolean
): { motor: InicioCardMotorSnapshot; revision: string } {
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada,
  });
  const overlayHb = linhasOverlayDebitoHbAReceber(cooperadoId, cooperativaId);
  const paridadeHb = aplicarDebitoHbHibridoNaParidade(paridade, overlayHb);
  const motor = inicioCardMotorFromParidadeFinanceiro(
    data,
    cooperadoId,
    cooperativaId,
    paridadeHb
  );
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);
  return { motor, revision };
}
