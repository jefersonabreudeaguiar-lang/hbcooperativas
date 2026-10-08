"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  cooperadoFinanceiroBloqueiaEntradaApp,
  cooperadoFinanceiroDesatualizado,
  limparFichaObsoletaCooperado,
} from "@/services/fichaSyncGuard";
import { solicitarRecuperacaoFinanceiroCooperado } from "@/services/cooperadoFinanceiroGuard";
import {
  cooperadoLocalResumeReady,
  isCooperadoManualOperacionalSync,
  shouldSkipCooperadoSecondaryMountSync,
} from "@/lib/performance/cooperadoColdStart";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  isCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  requestAppSyncImmediate,
  requestCooperadoAppReleaseSync,
  requestCooperadoPrimeiraCargaSync,
} from "@/services/syncRequest";
import { purgarInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { filtrarInicioCardPersistidoLeituraBic } from "@/lib/cooperadoInicioCardPolicy";
import {
  inicioCardCacheProntoParaAbertura,
  lerInicioCardPersistidoFlex,
} from "@/lib/cooperadoInicioCardPersistencia";
import {
  getCooperadoRunSyncSessionLease,
  saveAppDataIfSyncLeaseCurrent,
} from "@/services/operacionalPullLease";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Bloqueio máximo da tela cheia; sync segue em background depois disso. */
const SYNC_BLOCK_MAX_MS = 18_000;

/**
 * Cooperado: sync financeiro na nuvem sem prender o app por minutos.
 * Só ocupa a tela inteira quando não há dados locais; caso contrário, banner + navegação.
 */
export function CooperadoFinanceiroGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { syncingForUi, lastSyncedAt } = useSyncStatus();
  const [syncWaitExceeded, setSyncWaitExceeded] = useState(false);

  const cacheInicioCard = useMemo(() => {
    if (!user?.cooperadoId || user.role !== "cooperado") return null;
    const data = getData();
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) return null;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    return filtrarInicioCardPersistidoLeituraBic(
      lerInicioCardPersistidoFlex(cooperadoId, coopId)
    );
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, user?.role]);

  const bloqueiaEntrada = useAppDataSelector((data) => {
    if (!data || !user?.cooperadoId || user.role !== "cooperado") return false;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return true;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    return cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, coopId);
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, user?.role]);

  useEffect(() => {
    if (user?.role !== "cooperado" || !user.cooperadoId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const data = getData();
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    if (cooperadoAppReleaseNeedsOperacionalSync()) {
      purgarInicioCardValorReceberCooperado(user);
      requestCooperadoAppReleaseSync();
    }
    const limpo = limparFichaObsoletaCooperado(data, cooperadoId, coopId);
    if (limpo !== data) {
      saveAppDataIfSyncLeaseCurrent(getCooperadoRunSyncSessionLease() ?? undefined, limpo);
    }
    if (isCooperadoEventDrivenSync()) {
      if (cooperadoFinanceiroBloqueiaEntradaApp(getData(), cooperadoId, coopId)) {
        requestCooperadoPrimeiraCargaSync();
        return;
      }
      const desatualizado = cooperadoFinanceiroDesatualizado(getData(), cooperadoId, coopId);
      void resolveCooperativaCnpj(data, coopId, user).then((cnpj) => {
        if (!cnpj) return;
        void runCooperadoForegroundOperacionalCheck(cnpj, { financeiroDesatualizado: desatualizado });
      });
      return;
    }
    if (!isCooperadoManualOperacionalSync()) {
      solicitarRecuperacaoFinanceiroCooperado();
      if (!shouldSkipCooperadoSecondaryMountSync()) {
        requestAppSyncImmediate();
      }
    }
  }, [user?.id, user?.cooperadoId, user?.role]);

  useEffect(() => {
    if (user?.role !== "cooperado") {
      setSyncWaitExceeded(false);
      return;
    }
    if (!bloqueiaEntrada || lastSyncedAt != null) {
      setSyncWaitExceeded(false);
      return;
    }
    const timer = window.setTimeout(() => setSyncWaitExceeded(true), SYNC_BLOCK_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [user?.role, bloqueiaEntrada, lastSyncedAt, user?.id]);

  if (!user || user.role !== "cooperado") {
    return <>{children}</>;
  }

  const abrirComCacheInicio =
    inicioCardCacheProntoParaAbertura(cacheInicioCard) || cooperadoLocalResumeReady(user);

  const carregandoFinanceiro =
    bloqueiaEntrada &&
    (syncingForUi || (lastSyncedAt == null && !syncWaitExceeded && !abrirComCacheInicio));

  const temDadosLocais = isAppDataWarm();

  if (carregandoFinanceiro && !abrirComCacheInicio && !temDadosLocais) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto py-12 space-y-4">
          <PageSkeleton />
          <p className="text-center text-sm text-gray-600">
            Baixando sua ficha e entregas da nuvem…
          </p>
        </div>
      </div>
    );
  }

  const falhaCarregarFicha =
    bloqueiaEntrada && !syncingForUi && (syncWaitExceeded || lastSyncedAt != null);

  if (falhaCarregarFicha) {
    solicitarRecuperacaoFinanceiroCooperado();
    if (!isCooperadoManualOperacionalSync()) {
      requestAppSyncImmediate();
    } else if (isCooperadoEventDrivenSync()) {
      requestCooperadoPrimeiraCargaSync();
    }
    return <>{children}</>;
  }

  return <>{children}</>;
}
