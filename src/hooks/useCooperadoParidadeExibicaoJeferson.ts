"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { User } from "@/types";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import {
  cooperadoAReceberFinanceiroAutoritativoPiloto,
  cooperadoAReceberParidadeUnificadaPilotoJeferson,
} from "@/lib/cooperado/cooperadoAReceberParidadeMobileUnificada";
import { cooperadoApresentacaoFinanceiroUiCooperado } from "@/lib/cooperado/cooperadoInicioSincronizadoComFinanceiro";
import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import {
  lerCooperadoPwaFichaResumoSnapshot,
  resolveParidadeFromFichaResumoSnapshot,
} from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import {
  aplicarDebitoHbHibridoNaParidade,
  linhasOverlayDebitoHbAReceber,
} from "@/lib/hb-credit/hbAReceberHibrido";
import {
  getAppDataDomainRevision,
  subscribeAppDataDomain,
} from "@/lib/performance/appDataDomainNotify";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

/** Única leitura Jeferson — Início e Financeiro chamam isto (via hook). */
export function lerParidadeExibicaoJefersonPiloto(
  user: Omit<User, "password">,
  apresentacaoFinanceiroUi: boolean,
  cooperadoPagamentosHydrated: boolean,
  syncing: boolean
): LeituraFinanceiraParidadeCooperado | null {
  if (!cooperadoAReceberParidadeUnificadaPilotoJeferson(user)) return null;
  if (!isAppDataWarm() || !user.cooperadoId) return null;

  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);

  const autoritativo = cooperadoAReceberFinanceiroAutoritativoPiloto(
    user,
    apresentacaoFinanceiroUi,
    cooperadoPagamentosHydrated,
    syncing
  );

  const live = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, coopId, {
    apresentacaoConsolidada: autoritativo ? true : apresentacaoFinanceiroUi,
  });
  const overlay = linhasOverlayDebitoHbAReceber(cooperadoId, coopId);
  let paridade = aplicarDebitoHbHibridoNaParidade(live, overlay);

  if (!autoritativo && paridade.valorLiquido <= 0.005) {
    const snap = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, coopId);
    const fromSnap = snap ? resolveParidadeFromFichaResumoSnapshot(snap) : null;
    if (fromSnap && fromSnap.valorLiquido > 0.005) {
      paridade = aplicarDebitoHbHibridoNaParidade(fromSnap, overlay);
    }
  }

  return paridade;
}

/**
 * Paridade mobile cooperado Jeferson — mesma instância para Início e Financeiro.
 */
export function useCooperadoParidadeExibicaoJeferson(
  user: Omit<User, "password"> | null | undefined,
  active: boolean,
  apresentacaoConsolidadaFluxo: boolean
): LeituraFinanceiraParidadeCooperado | null {
  const { cooperadoPagamentosHydrated, syncingForUi } = useSyncStatus();
  const hbDescontosRevision = useContaCoopDescontosRevision();
  const financeRevision = useSyncExternalStore(
    (onStoreChange) => subscribeAppDataDomain("financeiro", onStoreChange),
    () => (isAppDataWarm() ? String(getAppDataDomainRevision("financeiro")) : "0"),
    () => "0"
  );

  const apresentacaoFinanceiroUi = cooperadoApresentacaoFinanceiroUiCooperado(
    user,
    apresentacaoConsolidadaFluxo,
    cooperadoPagamentosHydrated
  );

  return useMemo(() => {
    if (!active || !user || !cooperadoAReceberParidadeUnificadaPilotoJeferson(user)) {
      return null;
    }
    return lerParidadeExibicaoJefersonPiloto(
      user,
      apresentacaoFinanceiroUi,
      cooperadoPagamentosHydrated,
      syncingForUi
    );
  }, [
    active,
    user?.id,
    user?.cooperadoId,
    user?.cooperativaId,
    apresentacaoFinanceiroUi,
    cooperadoPagamentosHydrated,
    syncingForUi,
    financeRevision,
    hbDescontosRevision,
  ]);
}
