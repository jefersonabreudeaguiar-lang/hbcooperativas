/**
 * Piloto Jeferson — uma função de paridade para Início e Financeiro (HB híbrido + fallback snap).
 * Demais cooperados GA continuam no ramo legado até validação do piloto.
 */
import type { AppData } from "@/types";
import type { User } from "@/types";
import { isCooperadoBicExibicaoPadraoAtiva } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { isCooperadoFinanceiroAppDataLiveRead } from "@/lib/cooperado/cooperadoFinanceiroAppDataLiveRead";
import type { CooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { resolveParidadeFromFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoJefersonPilotoFinanceiroAtivo } from "@/lib/cooperado/cooperadoJefersonPilotoFinanceiro";
import {
  cooperadoBicAutorizaZerarCardInicio,
  cooperadoMotorTemObrigacaoReceber,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import {
  aplicarDebitoHbHibridoNaParidade,
  linhasOverlayDebitoHbAReceber,
} from "@/lib/hb-credit/hbAReceberHibrido";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import { getData, isAppDataWarm } from "@/services/dataStore";

const PARIDADE_EXIBICAO_DRIFT_EPS = 0.02;

export const COOPERADO_A_RECEBER_PARIDADE_UNIFICADA_PILOTO_VERSION = 1;

/** Piloto de leitor único — somente sessão cooperado Jeferson. */
export function cooperadoAReceberParidadeUnificadaPilotoJeferson(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return cooperadoJefersonPilotoFinanceiroAtivo(user);
}

export type ResolverParidadeCooperadoMobileInput = {
  data: AppData | null | undefined;
  cooperadoId: string;
  coopId: string | undefined;
  apresentacaoFinanceiroUi: boolean;
  fichaResumoSnap: CooperadoPwaFichaResumoSnapshot | null;
  financeiroDormant: boolean;
  /** Ramo GA sync-first (live com fallback snap quando live=0). */
  syncFinanceiroGa?: boolean;
  inicioCardPersistido?: InicioCardMotorSnapshot | null;
  /** Pós-sync: só motor BIC no AppData — sem snapshot/cache antigo. */
  financeiroAutoritativo?: boolean;
};

export function cooperadoAReceberFinanceiroAutoritativoPiloto(
  user: Omit<User, "password"> | null | undefined,
  apresentacaoFinanceiroUi: boolean,
  cooperadoPagamentosHydrated: boolean,
  syncing: boolean
): boolean {
  if (!cooperadoAReceberParidadeUnificadaPilotoJeferson(user)) return false;
  return Boolean(apresentacaoFinanceiroUi && cooperadoPagamentosHydrated && !syncing);
}

function appDataFinanceiroConfiavel(
  store: AppData,
  cooperadoId: string,
  coopId: string
): boolean {
  return (
    cooperadoTemDadosFinanceirosMinimos(store, cooperadoId, coopId) &&
    !cooperadoFinanceiroDesatualizado(store, cooperadoId, coopId)
  );
}

function lerParidadeLive(
  store: AppData,
  cooperadoId: string,
  coopId: string,
  apresentacaoFinanceiroUi: boolean,
  financeiroAutoritativo: boolean
): LeituraFinanceiraParidadeCooperado {
  return cooperadoLeituraFinanceiraExibicao(store, cooperadoId, coopId, {
    apresentacaoConsolidada: financeiroAutoritativo ? true : apresentacaoFinanceiroUi,
  });
}

function paridadeMinimaDeValorCard(
  valor: number,
  mesLabel: string,
  base: LeituraFinanceiraParidadeCooperado | null
): LeituraFinanceiraParidadeCooperado | null {
  if (valor <= 0.005 || !base) return null;
  return {
    ...base,
    valorLiquido: valor,
    mesLabel: mesLabel?.trim() || base.mesLabel,
    consolidado: { ...base.consolidado, valorLiquido: valor },
  };
}

export function resolverParidadeCooperadoMobileExibicao(
  input: ResolverParidadeCooperadoMobileInput
): LeituraFinanceiraParidadeCooperado | null {
  const { cooperadoId, coopId, apresentacaoFinanceiroUi, fichaResumoSnap, financeiroDormant } =
    input;
  if (!cooperadoId || !coopId) return null;

  const financeiroAutoritativo = Boolean(input.financeiroAutoritativo);
  const store = (isAppDataWarm() ? getData() : input.data) ?? input.data;
  const live = store
    ? lerParidadeLive(store, cooperadoId, coopId, apresentacaoFinanceiroUi, financeiroAutoritativo)
    : null;
  const fromSnapGuard = fichaResumoSnap
    ? resolveParidadeFromFichaResumoSnapshot(fichaResumoSnap)
    : null;
  const liveValor = live?.valorLiquido ?? 0;
  const snapValor = fromSnapGuard?.valorLiquido ?? 0;
  const overlayHb = linhasOverlayDebitoHbAReceber(cooperadoId, coopId);
  const withHybrid = (p: LeituraFinanceiraParidadeCooperado | null) =>
    p ? aplicarDebitoHbHibridoNaParidade(p, overlayHb) : null;

  const liquidadoPeloResponsavel = Boolean(
    store && cooperadoBicAutorizaZerarCardInicio(store, cooperadoId, coopId)
  );

  const persistidoCard = input.inicioCardPersistido;
  const persistidoValor =
    persistidoCard && cooperadoMotorTemObrigacaoReceber(persistidoCard)
      ? persistidoCard.valor
      : 0;

  const fallbackPersistidoCard = (): LeituraFinanceiraParidadeCooperado | null => {
    if (financeiroAutoritativo) return null;
    if (liquidadoPeloResponsavel || persistidoValor <= 0.005) return null;
    return paridadeMinimaDeValorCard(
      persistidoValor,
      persistidoCard?.mesLabel ?? "—",
      live ?? fromSnapGuard
    );
  };

  if (financeiroAutoritativo && live) {
    return withHybrid(live);
  }

  if (
    store &&
    live &&
    appDataFinanceiroConfiavel(store, cooperadoId, coopId) &&
    fromSnapGuard &&
    Math.abs(liveValor - snapValor) > PARIDADE_EXIBICAO_DRIFT_EPS &&
    !liquidadoPeloResponsavel
  ) {
    return withHybrid(live);
  }

  if (
    store &&
    live &&
    appDataFinanceiroConfiavel(store, cooperadoId, coopId) &&
    persistidoValor > 0.005 &&
    Math.abs(liveValor - persistidoValor) > PARIDADE_EXIBICAO_DRIFT_EPS &&
    !liquidadoPeloResponsavel
  ) {
    return withHybrid(live);
  }

  if (input.syncFinanceiroGa && isAppDataWarm() && store && live) {
    if (liveValor > 0.005 || liquidadoPeloResponsavel) return withHybrid(live);
    if (fromSnapGuard && snapValor > 0.005 && !liquidadoPeloResponsavel) {
      return withHybrid(fromSnapGuard);
    }
    const fromCard = fallbackPersistidoCard();
    if (fromCard) return withHybrid(fromCard);
    return withHybrid(live);
  }

  if (fromSnapGuard && snapValor > 0.005 && liveValor <= 0.005 && !liquidadoPeloResponsavel) {
    return withHybrid(fromSnapGuard);
  }
  if (liveValor > 0.005) return withHybrid(live);
  if (liquidadoPeloResponsavel) return withHybrid(live ?? fromSnapGuard);
  if (isCooperadoFinanceiroAppDataLiveRead()) {
    if (!store) return withHybrid(fromSnapGuard && snapValor > 0.005 ? fromSnapGuard : null);
    return withHybrid(live ?? (fromSnapGuard && snapValor > 0.005 ? fromSnapGuard : null));
  }
  if (financeiroDormant && fromSnapGuard && snapValor > 0.005) {
    const bicPadrao = isCooperadoBicExibicaoPadraoAtiva();
    if (bicPadrao && live && isAppDataWarm()) {
      const drift = Math.abs(snapValor - liveValor) > 0.02;
      if (drift && liveValor > 0.005) return withHybrid(live);
      return withHybrid(fromSnapGuard);
    }
    if (isBicCentralReadAuthorityEnabled() && live && isAppDataWarm() && liveValor > 0.005) {
      return withHybrid(live);
    }
    if (live && liveValor > 0.005 && Math.abs(snapValor - liveValor) > 0.02) {
      return withHybrid(live);
    }
    return withHybrid(fromSnapGuard);
  }
  if (!store) {
    const snap = fromSnapGuard && snapValor > 0.005 ? fromSnapGuard : null;
    const card = fallbackPersistidoCard();
    return withHybrid(snap ?? card);
  }
  const card = fallbackPersistidoCard();
  return withHybrid(
    live ??
      (fromSnapGuard && snapValor > 0.005 ? fromSnapGuard : null) ??
      card
  );
}
