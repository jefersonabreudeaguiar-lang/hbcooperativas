"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  clearCooperadoPostShellSyncStarted,
  cooperadoPostShellSyncPermitido,
  markCooperadoPostShellSyncStarted,
  scheduleCooperadoPostShellSync,
} from "@/lib/performance/cooperadoPostShellSync";
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
import { markRqlDataReady } from "@/lib/performance/rqlMarks";
import {
  CooperadoFinanceiroShellProvider,
  type CooperadoFinanceiroShellState,
} from "@/components/cooperado/CooperadoFinanceiroShellContext";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cooperadoPwaInstantPaintReady } from "@/lib/cooperado/cooperadoPwaInstantResume";

/** Após este tempo, o conteúdo pode seguir mesmo sem sync (shell já navegável). */
const SYNC_HINT_MAX_MS = 18_000;

/**
 * Cooperado: estado financeiro + sync em background.
 * Não bloqueia AppShell — apenas informa o conteúdo via contexto.
 */
export function CooperadoFinanceiroGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { syncingForUi, lastSyncedAt } = useSyncStatus();
  const [syncWaitExceeded, setSyncWaitExceeded] = useState(false);
  const dataReadyMarkedRef = useRef(false);

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

    const runFinanceBootstrap = () => {
      if (!cooperadoPostShellSyncPermitido()) return;
      markCooperadoPostShellSyncStarted();

      if (isCooperadoPwaMessengerMode()) {
        if (cooperadoAppReleaseNeedsOperacionalSync()) {
          requestCooperadoAppReleaseSync();
        }
        clearCooperadoPostShellSyncStarted();
        return;
      }

      const data = getData();
      const coopId = getUserCooperativaId(user, data);
      if (!coopId) {
        clearCooperadoPostShellSyncStarted();
        return;
      }
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId!, coopId);

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
          clearCooperadoPostShellSyncStarted();
          return;
        }
        const desatualizado = cooperadoFinanceiroDesatualizado(getData(), cooperadoId, coopId);
        void resolveCooperativaCnpj(data, coopId, user).then((cnpj) => {
          if (!cnpj) return;
          void runCooperadoForegroundOperacionalCheck(cnpj, { financeiroDesatualizado: desatualizado });
        });
        clearCooperadoPostShellSyncStarted();
        return;
      }

      if (!isCooperadoManualOperacionalSync()) {
        solicitarRecuperacaoFinanceiroCooperado();
        if (!shouldSkipCooperadoSecondaryMountSync()) {
          requestAppSyncImmediate();
        }
      }
      clearCooperadoPostShellSyncStarted();
    };

    scheduleCooperadoPostShellSync(runFinanceBootstrap);
  }, [user?.id, user?.cooperadoId, user?.role]);

  const cooperadoAtivo = user?.role === "cooperado" && Boolean(user?.cooperadoId);
  const aguardandoSyncInicial =
    cooperadoAtivo && Boolean(bloqueiaEntrada) && lastSyncedAt == null;

  useEffect(() => {
    if (!aguardandoSyncInicial) {
      const resetId = requestAnimationFrame(() => setSyncWaitExceeded(false));
      return () => cancelAnimationFrame(resetId);
    }
    const timer = window.setTimeout(() => setSyncWaitExceeded(true), SYNC_HINT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [aguardandoSyncInicial]);

  useEffect(() => {
    if (user?.role !== "cooperado" || dataReadyMarkedRef.current) return;
    if (!isAppDataWarm()) return;
    const data = getData();
    const coopId = getUserCooperativaId(user, data);
    if (!coopId || !user.cooperadoId) return;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const pronto =
      !cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, coopId) || lastSyncedAt != null;
    if (!pronto) return;
    dataReadyMarkedRef.current = true;
    markRqlDataReady();
  }, [user?.role, user?.cooperadoId, bloqueiaEntrada, lastSyncedAt]);

  const abrirComCacheInicio =
    cooperadoAtivo &&
    user &&
    (inicioCardCacheProntoParaAbertura(cacheInicioCard) ||
      cooperadoLocalResumeReady(user) ||
      (isCooperadoPwaMessengerMode() && cooperadoPwaInstantPaintReady(user)));

  const aguardandoDadosFinanceiros =
    cooperadoAtivo &&
    Boolean(bloqueiaEntrada) &&
    (syncingForUi || (lastSyncedAt == null && !syncWaitExceeded && !abrirComCacheInicio));

  const falhaCarregarFicha =
    cooperadoAtivo &&
    Boolean(bloqueiaEntrada) &&
    !syncingForUi &&
    (syncWaitExceeded || lastSyncedAt != null);

  useEffect(() => {
    if (!falhaCarregarFicha) return;
    solicitarRecuperacaoFinanceiroCooperado();
    scheduleCooperadoPostShellSync(() => {
      if (!isCooperadoManualOperacionalSync()) {
        requestAppSyncImmediate();
      } else if (isCooperadoEventDrivenSync()) {
        requestCooperadoPrimeiraCargaSync();
      }
    });
  }, [falhaCarregarFicha]);

  if (!user || user.role !== "cooperado") {
    return <>{children}</>;
  }

  let mensagemStatus: string | null = null;
  if (aguardandoDadosFinanceiros && !isAppDataWarm()) {
    mensagemStatus = "Atualizando dados da nuvem… Você já pode usar as abas.";
  } else if (aguardandoDadosFinanceiros || syncingForUi) {
    mensagemStatus = "Atualizando dados…";
  }

  const shellState: CooperadoFinanceiroShellState = {
    aguardandoDadosFinanceiros: Boolean(aguardandoDadosFinanceiros),
    bloqueiaEntrada: Boolean(bloqueiaEntrada),
    mensagemStatus,
  };

  return (
    <CooperadoFinanceiroShellProvider value={shellState}>{children}</CooperadoFinanceiroShellProvider>
  );
}
