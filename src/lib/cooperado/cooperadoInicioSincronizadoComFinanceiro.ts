/**
 * Modelo 621 — Início “A receber” = mesma paridade BIC do Financeiro (cirúrgico).
 */
import type { AppData } from "@/types";
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoPilotAppDataTemFinanceiroLocal,
  cooperadoPilotFinanceiroExibirComSnapshotsLocais,
} from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import {
  cooperadoLocalResumeReady,
  isCooperadoInstantResumeEnabled,
} from "@/lib/performance/cooperadoColdStart";
import {
  aplicarDebitoHbHibridoNaParidade,
  linhasOverlayDebitoHbAReceber,
} from "@/lib/hb-credit/hbAReceberHibrido";
import {
  inicioCardMotorFromParidadeFinanceiro,
} from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import type { InicioCardMotorSnapshot } from "@/lib/cooperado/cooperadoInicioCardMotorTypes";
import { cooperadoMotorRevisionOperacional } from "@/lib/cooperado/cooperadoMotorRevisionOperacional";
import type { CooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { resolveParidadeFromFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { resolverParidadeCooperadoMobileExibicao } from "@/lib/cooperado/cooperadoAReceberParidadeMobileUnificada";
import {
  cooperadoBicAutorizaZerarCardInicio,
  cooperadoMotorTemObrigacaoReceber,
} from "@/lib/cooperadoInicioCardPolicy";

export function cooperadoInicioSincronizadoComFinanceiro(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  return isCooperadoMobileGaPromoted(user);
}

/** Mesma regra da aba Financeiro (`FichaCorridaContent`). */
export function cooperadoApresentacaoFinanceiroUiCooperado(
  user: Omit<User, "password"> | null | undefined,
  apresentacaoConsolidada: boolean,
  cooperadoPagamentosHydrated: boolean
): boolean {
  if (!user || user.role !== "cooperado") return apresentacaoConsolidada;
  return (
    apresentacaoConsolidada ||
    cooperadoPilotFinanceiroExibirComSnapshotsLocais(user) ||
    cooperadoPilotAppDataTemFinanceiroLocal(user) ||
    (cooperadoPagamentosHydrated &&
      isCooperadoInstantResumeEnabled() &&
      cooperadoLocalResumeReady(user))
  );
}

export function cooperadoCardInicioMotorParidadeUnificadaPiloto(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  apresentacaoFinanceiroUi: boolean,
  fichaResumoSnap: CooperadoPwaFichaResumoSnapshot | null,
  inicioPersistido: InicioCardMotorSnapshot | null | undefined
): { motor: InicioCardMotorSnapshot; revision: string } | null {
  if (!cooperativaId) return null;

  const paridade = resolverParidadeCooperadoMobileExibicao({
    data,
    cooperadoId,
    coopId: cooperativaId,
    apresentacaoFinanceiroUi,
    fichaResumoSnap,
    financeiroDormant: false,
    syncFinanceiroGa: true,
    inicioCardPersistido: inicioPersistido,
  });
  if (!paridade) return null;

  let motor = inicioCardMotorFromParidadeFinanceiro(data, cooperadoId, cooperativaId, paridade);
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);

  if (cooperadoMotorTemObrigacaoReceber(motor)) {
    return { motor, revision };
  }

  const tinhaValorExibido = Boolean(
    inicioPersistido && cooperadoMotorTemObrigacaoReceber(inicioPersistido)
  );
  const autorizaZerar = cooperadoBicAutorizaZerarCardInicio(data, cooperadoId, cooperativaId, {
    tinhaValorExibido,
  });
  if (autorizaZerar) return { motor, revision };

  const snapParidade = fichaResumoSnap
    ? resolveParidadeFromFichaResumoSnapshot(fichaResumoSnap)
    : null;
  if (snapParidade && snapParidade.valorLiquido > 0.005) {
    const overlayHb = linhasOverlayDebitoHbAReceber(cooperadoId, cooperativaId);
    motor = inicioCardMotorFromParidadeFinanceiro(
      data,
      cooperadoId,
      cooperativaId,
      aplicarDebitoHbHibridoNaParidade(snapParidade, overlayHb)
    );
    if (cooperadoMotorTemObrigacaoReceber(motor)) return { motor, revision };
  }

  if (tinhaValorExibido && inicioPersistido) {
    return {
      motor: inicioPersistido,
      revision: `persistido:${inicioPersistido.valor}`,
    };
  }

  return null;
}

export function cooperadoCardInicioMotorParidadeFinanceiro(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  apresentacaoFinanceiroUi?: boolean
): { motor: InicioCardMotorSnapshot; revision: string } {
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada: apresentacaoFinanceiroUi,
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
