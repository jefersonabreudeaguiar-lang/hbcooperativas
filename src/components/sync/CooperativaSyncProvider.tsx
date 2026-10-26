"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  resolveCooperativaCnpj,
  getCooperativaCnpj,
  pushNotasPedidoToCloud,
  pushNotaComFotosEmStreaming,
  flushPendingNotaDeletes,
  fetchNotaPedidoFromCloud,
  finalizeNotaEntregaNaNuvem,
  refreshCooperadoNotasEmAnalise,
  republishLocalAguardandoConferencia,
  syncStaffFilaConferenciaLiveFromCloud,
} from "@/services/notaPedidoCloudService";
import { runCooperadoDeliveryQueueMaintenance, ensureCooperadoDeliveryQueueOnlineListener } from "@/services/cooperadoDeliveryQueueCoordinator";
import {
  getSyncMinGapMs,
  ensureCooperadoFinanceiroFromCloud,
  syncCooperativaBackground,
  syncCooperadoAtualizarFromCloud,
  syncCooperativaBidirectional,
  syncStaffTieredPullFromCloud,
  syncOperacionalFromCloud,
  type SyncOperacionalFromCloudResult,
} from "@/services/cooperativaSyncCloudService";
import {
  acquireCooperativaSyncSessionLease,
  bindCooperadoRunSyncSessionLease,
  getCooperadoRunSyncSessionLease,
  saveAppDataIfSyncLeaseCurrent,
  type CooperativaSyncSessionLease,
} from "@/services/operacionalPullLease";
import { cooperadoApresentacaoFinanceiraPosRunSync } from "@/lib/cooperadoApresentacaoFinanceira";
import { notifyCooperadoEntregasRemovidasPelaCooperativa } from "@/lib/cooperadoEntregaRemovidaNotify";
import { contarEntregasApagadasCooperadoNoSync } from "@/services/cooperadoEntregasService";
import {
  cooperadoFinanceiroBloqueiaEntradaApp,
  cooperadoFinanceiroDesatualizado,
  cooperadoFinanceiroStaleRecuperavelEmBackground,
  aplicarSanidadeFinanceiroCooperadoLocal,
  cooperadoTemDadosFinanceirosMinimos,
} from "@/services/fichaSyncGuard";
import { avaliarIntegridadeFinanceiroCooperado } from "@/services/cooperadoFinanceiroGuard";
import { ensureOperacionalAlinhadoComNuvem } from "@/services/operacionalRestoreService";
import { refreshContaCoopDescontosAfterOperacionalSync } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { isStaffConferenciaModalOpen } from "@/lib/performance/staffConferenciaSyncTier";
import { isStaffHbCoopBackgroundSyncRoute } from "@/lib/hb-credit/staffHbSyncRoute";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { pushCooperadoToCloud, resolverCooperadoIdCanonico, flushPendingCooperadoPushes, notaPertenceCooperado } from "@/services/cooperadoCloudService";
import {
  registerSyncHandler,
  registerVotacaoOperacionalSyncHandler,
  requestCooperadoPrimeiraCargaSync,
} from "@/services/syncRequest";
import {
  isAppIdle,
  markUserActivity,
  onAppIdleChange,
  startIdleMonitor,
} from "@/services/idleActivity";
import {
  getData,
  isAppDataWarm,
  preloadAppData,
  refreshData,
  saveDataSafe,
  subscribe,
  updateDataSafe,
  waitForAppDataWarm,
} from "@/services/dataStore";
import { readAppDataPersistRaw } from "@/lib/staff/staffGestaoPersistKey";
import {
  ensureCloudSessionReady,
  getLastCloudSyncError,
  userToCloudProfile,
} from "@/lib/security/clientSession";
import { getCooperadoNome } from "@/utils/calculations";
import { readNotaFotoAtIndex, resolveNotaFotosForUpload } from "@/services/localMediaStore";
import { compactarFotosNoArmazenamento, contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { isDiretoriaRole } from "@/permissions";
import type { User, UserRole } from "@/types";
import {
  h197ObserveLifecycleEvent,
  installH197WindowExport,
  isH197CaptureEnabled,
  type H197CaptureContext,
} from "@/lib/diagnostic/h197PairedCapture";
import {
  cooperadoLocalResumeReady,
  cooperadoPreserveHydrationOnSilentSync,
  cooperadoSyncVisibleInUi,
  ensureCooperadoAppDataEagerWarm,
  ensureAppDataEagerWarm,
  cooperadoOperacionalSyncPermitido,
  isCooperadoInstantResumeEnabled,
  isCooperadoManualOperacionalSync,
  isCooperadoUserSyncVisible,
  isStaffGestaoRole,
  markNextCooperadoSyncSilent,
  markCooperadoUserSyncVisible,
  resetCooperadoUserSyncVisible,
  scheduleCooperadoColdStartSync,
  scheduleCooperadoPostInteractiveTask,
  scheduleStaffPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";
import {
  consumeCooperadoEventDrivenSyncGrant,
  cooperadoAppReleaseNeedsOperacionalSync,
  fingerprintCooperativaCloudRevision,
  hasCooperadoEventDrivenGrant,
  isCooperadoEventDrivenSync,
  persistAppliedCooperativaCloudRevision,
  persistCooperadoLastOperacionalSyncAt,
  persistOperacionalSyncedAppBuild,
  readCooperadoLastOperacionalSyncAt,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { markRqlColdStartPhase } from "@/lib/performance/rqlMarks";
import { resolveSyncTierPlan84 } from "@/lib/performance/syncPlan84";
import { useCooperadoStaffRevisionWatch } from "@/hooks/useCooperadoStaffRevisionWatch";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { scheduleCooperadoPostShellSync } from "@/lib/performance/cooperadoPostShellSync";
import { fetchCooperativaCloudRevision } from "@/services/cooperativaSyncRevisionService";
import { notifyAppSubtleUpdate } from "@/lib/cooperadoSubtleUpdate";
import { requestCooperadoAppReleaseSync, type SyncRunOptions } from "@/services/syncRequest";
import { staffResponsavelOpeningSyncRequest } from "@/lib/staff/staffResponsavelSyncPolicy";
import {
  isStaffGestaoLiveSyncEnabled,
  resolveStaffGestaoLiveSyncIntervalMs,
  staffResponsavelLiveSyncTickRequest,
  staffResponsavelLifecycleSyncRequestLive,
} from "@/lib/staff/staffResponsavelLiveSyncPolicy";
import { scheduleStaffGestaoLiveSyncLoop } from "@/lib/performance/staffGestaoLiveSyncLoop";
import { shouldBlockStaffAutoSyncDuringConferencia } from "@/lib/performance/staffConferenciaSyncTier";
import { staffGestaoPausaTrabalhoPesadoAutomatico } from "@/lib/staff/staffGestaoPausaTrabalhoPesado";
import {
  staffGestaoAberturaSyncDelayMs,
  staffGestaoEmViewportDesktop,
  staffGestaoPerfilAberturaSyncPermitido,
  staffGestaoPerfilCapSyncAutomatico,
  staffGestaoSyncBackgroundPermitido,
} from "@/lib/staff/staffGestaoModoDesktop";
import { scheduleStaffGestaoPersistReloadAfterPaint } from "@/services/dataStore";
import {
  isStaffFilaNotasLivePollEnabled,
  resolveStaffFilaBackgroundCatchupMs,
} from "@/lib/performance/staffFilaNotasLivePoll";
import { usePathname } from "next/navigation";
import { expandStaffTierPlanIfOperacionalVazio } from "@/lib/staff/staffOperacionalColdHydrate";
import { purgarInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { scheduleCooperadoPwaOperacionalParidadePull } from "@/lib/cooperado/cooperadoPwaFinanceiroParidadeRefresh";
import {
  cooperadoPwaMaterializarSnapshotsFinanceirosPosSync,
  cooperadoRematerializarFinanceiroLocalSePossivel,
  scheduleCooperadoMessengerStaffRevisionPull,
} from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { empacotarModeloAparelhoJeferson } from "@/lib/cooperado/cooperadoAparelhoJefersonPacote";
import { scheduleCooperadoHbCreditSyncPadrao } from "@/lib/cooperado/cooperadoHbCreditSyncPadrao";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import {
  cooperadoPwaMessengerPrecisaSyncOperacionalInicial,
  rematerializarCooperadoPwaSnapshotsSeNecessario,
} from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import {
  cooperadoGaInicioSomenteCasca,
  cooperadoMobileDeferOperacionalSyncNaAbertura,
  isCooperadoMobileGaPromoted,
} from "@/lib/cooperado/cooperadoMobilePilot";
import { tryAckCooperadoAppReleaseWhenLocalReady } from "@/lib/cooperado/cooperadoMobileReleaseLocalAck";
import { scheduleCooperadoGaPrimeiraCargaSilenciosa } from "@/lib/cooperado/cooperadoGaColdBootstrap";

const COOPERADO_PUSH_GAP_MS = 5 * 60 * 1000;
/** Intervalo mínimo entre pulls de operacional só para votação (bem menor que sync completa). */
const VOTACAO_OPERACIONAL_PULL_GAP_MS = 45_000;
/** Evita sync infinita — libera o chip "Atualizando…" mesmo em cooperativas grandes. */
const SYNC_TIMEOUT_MS = 90_000;
const COOPERADO_ATUALIZAR_TIMEOUT_MS = 45_000;

function h197PassiveContext(
  user: ReturnType<typeof useAuth>["user"],
  cooperadoPagamentosHydratedRef: MutableRefObject<boolean>,
  syncingFlag: boolean
): H197CaptureContext {
  return {
    user,
    cooperadoPagamentosHydrated: cooperadoPagamentosHydratedRef.current,
    syncing: syncingFlag,
  };
}

function mensagemErroPullOperacionalCooperado(result: SyncOperacionalFromCloudResult): string | null {
  if (result.ok && (result.code === "ok" || result.code === "stale_discarded")) return null;
  switch (result.code) {
    case "fetch_failed":
      return "Não foi possível baixar seus pagamentos da nuvem. Verifique a internet e toque em Atualizar.";
    case "no_operacional":
      return "Financeiro da cooperativa indisponível na nuvem. Aguarde e toque em Atualizar.";
    case "no_coop_id":
      return "Cadastro da cooperativa incompleto neste aparelho. Saia e entre de novo.";
    case "invalid_cnpj":
      return "CNPJ da cooperativa inválido neste aparelho. Saia e entre de novo.";
    default:
      return null;
  }
}

/** Cooperado com fatia local utilizável — pode exibir valor a receber / ficha sem esperar reconciliação total. */
function cooperadoPodeExibirFinanceiroLocalmente(
  data: ReturnType<typeof getData>,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  if (cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, cooperativaId)) return false;
  if (cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId)) return false;
  return cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, cooperativaId);
}

function withSyncTimeout<T>(promise: Promise<T>, label: string, timeoutMs = SYNC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} demorou demais. Tente de novo em instantes.`)),
        timeoutMs
      );
    }),
  ]);
}

/** Upload/finalização de fotos do cooperado — roda após liberar o indicador “Atualizando…”. */
async function runCooperadoFotoUploadsInBackground(
  cnpj: string,
  cooperadoCanonico: string,
  cooperadoNome: string,
  cooperativaId?: string
): Promise<void> {
  const latest = getData();

  const pertence = (n: { cooperadoId: string; cooperadoNomeSnapshot?: string }) =>
    notaPertenceCooperado(latest, n, cooperadoCanonico, cooperativaId);

  const pendentes = latest.notasPedido.filter(
    (n) =>
      pertence(n) &&
      n.status === "aguardando_conferencia" &&
      !n.fotoNaNuvem
  );
  for (const nota of pendentes) {
    const fotos = await resolveNotaFotosForUpload(nota);
    if (fotos.length === 0) continue;
    const result =
      fotos.length > 1
        ? await pushNotaComFotosEmStreaming(
            cnpj,
            nota,
            (i) => readNotaFotoAtIndex(nota, i),
            fotos.length,
            cooperadoNome
          )
        : await pushNotasPedidoToCloud(cnpj, [nota], cooperadoNome);
    if (result.ok) {
      updateDataSafe((d) =>
        compactarFotosNoArmazenamento({
          ...d,
          notasPedido: d.notasPedido.map((n) =>
            n.id === nota.id
              ? {
                  ...n,
                  fotoNaNuvem: true,
                  cooperativaCnpj: normalizeCnpj(cnpj),
                  fotoPedido: undefined,
                  fotosPedido: undefined,
                }
              : n
          ),
        })
      );
    }
  }

  const afterUpload = getData();
  const pertenceAfter = (n: { cooperadoId: string; cooperadoNomeSnapshot?: string }) =>
    notaPertenceCooperado(afterUpload, n, cooperadoCanonico, cooperativaId);
  const aguardandoLocal = afterUpload.notasPedido.filter(
    (n) =>
      pertenceAfter(n) &&
      n.status === "aguardando_conferencia" &&
      n.fotoNaNuvem
  );
  for (const nota of aguardandoLocal) {
    const cloud = await fetchNotaPedidoFromCloud(cnpj, nota.id);
    if (!cloud || cloud.status !== "rascunho") continue;
    const esperado = nota.fotosEnviadasCount ?? 0;
    const naNuvem = contarFotosEnviadasNota(cloud);
    if (naNuvem < esperado) continue;
    await finalizeNotaEntregaNaNuvem(cnpj, nota, cooperadoNome);
  }

  const afterFinalize = getData();
  const pertenceFinal = (n: { cooperadoId: string; cooperadoNomeSnapshot?: string }) =>
    notaPertenceCooperado(afterFinalize, n, cooperadoCanonico, cooperativaId);
  const incompletasNaNuvem = afterFinalize.notasPedido.filter(
    (n) =>
      pertenceFinal(n) &&
      n.status === "aguardando_conferencia" &&
      n.fotoNaNuvem &&
      (n.fotosEnviadasCount ?? 0) > 0
  );
  for (const nota of incompletasNaNuvem) {
    const esperado = nota.fotosEnviadasCount ?? 0;
    const cloud = await fetchNotaPedidoFromCloud(cnpj, nota.id);
    const naNuvem = cloud ? contarFotosEnviadasNota(cloud) : 0;
    if (naNuvem >= esperado) continue;

    const fotos = await resolveNotaFotosForUpload(nota);
    if (fotos.length === 0) continue;
    await pushNotaComFotosEmStreaming(
      cnpj,
      nota,
      (i) => readNotaFotoAtIndex(nota, i),
      esperado,
      cooperadoNome
    );
  }
}

export type SyncStatusValue = {
  syncing: boolean;
  /** HX 9.0 — cooperado: false durante sync silencioso de abertura. */
  syncingForUi: boolean;
  /** Timestamp da última sync concluída (sucesso ou tentativa com fim). */
  lastSyncedAt: number | null;
  /** Erro da última tentativa (sessão nuvem, permissão, etc.). */
  lastSyncError: string;
  /**
   * Cooperado: primeira tentativa de puxar operacional (pagamentos/recibos) na sessão terminou.
   * Responsável/outros papéis: sempre true.
   */
  cooperadoPagamentosHydrated: boolean;
};

const SyncStatusContext = createContext<SyncStatusValue>({
  syncing: false,
  syncingForUi: false,
  lastSyncedAt: null,
  lastSyncError: "",
  cooperadoPagamentosHydrated: true,
});

export function useSyncStatus(): SyncStatusValue {
  return useContext(SyncStatusContext);
}

/**
 * Sync sob demanda + gestão: loop leve (notas_delta silencioso) nas rotas do responsável.
 * Cooperado: sem intervalo periódico (event-driven / manual).
 */
export function CooperativaSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!user || !isCooperadoInstantResumeEnabled()) return;
    scheduleCooperadoPostShellSync(() => {
      ensureAppDataEagerWarm();
      markRqlColdStartPhase("eager_warm");
    });
  }, [user?.id, user?.role]);

  const syncingRef = useRef(false);
  const cooperadoUserRefreshQueuedRef = useRef(false);
  const lastQueuedRefreshAtRef = useRef(0);
  const lastSyncStartedAtRef = useRef(0);
  const cooperadoSilentRetryAtRef = useRef(0);
  const scheduleCooperadoSilentSyncRetry = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isCooperadoEventDrivenSync()) return;
    const now = Date.now();
    if (now - cooperadoSilentRetryAtRef.current < 30_000) return;
    cooperadoSilentRetryAtRef.current = now;
    window.setTimeout(() => requestCooperadoPrimeiraCargaSync(), 4_000);
  }, []);
  const lastCooperadoPushRef = useRef(0);
  const lastVotacaoOperacionalPullRef = useRef(0);
  const votacaoOperacionalPullRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() =>
    typeof window !== "undefined" && user?.role === "cooperado"
      ? readCooperadoLastOperacionalSyncAt()
      : null
  );
  const [lastSyncError, setLastSyncErrorRaw] = useState("");
  const setLastSyncError = useCallback((value: SetStateAction<string>) => {
    setLastSyncErrorRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (next && userRef.current?.role === "cooperado") return "";
      return next;
    });
  }, []);
  const [cooperadoPagamentosHydrated, setCooperadoPagamentosHydrated] = useState(
    () => user?.role !== "cooperado" || isCooperadoManualOperacionalSync()
  );
  const cooperadoPagamentosHydratedRef = useRef(cooperadoPagamentosHydrated);
  cooperadoPagamentosHydratedRef.current = cooperadoPagamentosHydrated;

  const coopId = useAppDataSelector(
    (data) => (user ? getUserCooperativaId(user, data) : undefined),
    [user?.id, user?.cooperadoId, user?.cooperativaId, user?.role]
  );

  useEffect(() => {
    if (user?.role !== "cooperado") {
      setCooperadoPagamentosHydrated(true);
      return;
    }
    if (isCooperadoManualOperacionalSync() || isCooperadoMobileGaPromoted(user)) {
      setCooperadoPagamentosHydrated(true);
      return;
    }
    setCooperadoPagamentosHydrated(false);
  }, [user?.id, user?.role]);

  const markCooperadoPagamentosHydrated = useCallback(() => {
    setCooperadoPagamentosHydrated(true);
  }, []);

  const prepararFinanceiroLocalCooperado = useCallback(
    (currentUser: Omit<User, "password">) => {
      if (cooperadoRematerializarFinanceiroLocalSePossivel(currentUser)) {
        markCooperadoPagamentosHydrated();
        tryAckCooperadoAppReleaseWhenLocalReady(currentUser);
        return;
      }
      if (!isAppDataWarm() || !currentUser.cooperadoId) return;
      const data = getData();
      const coopId = getUserCooperativaId(currentUser, data) ?? currentUser.cooperativaId;
      if (!coopId) return;
      const cooperadoId = resolverCooperadoIdCanonico(data, currentUser.cooperadoId, coopId);
      if (
        cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId) &&
        !cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, coopId)
      ) {
        markCooperadoPagamentosHydrated();
        tryAckCooperadoAppReleaseWhenLocalReady(currentUser);
      }
    },
    [markCooperadoPagamentosHydrated]
  );

  useEffect(() => {
    if (user?.role !== "cooperado" || !coopId) return;
    const run = () => {
      if (!user || !isAppDataWarm()) return;
      const data = getData();
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId!, coopId);
      const fatiaLocalUtil =
        cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId) &&
        !cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, coopId);
      if (!fatiaLocalUtil && !cooperadoLocalResumeReady(user)) return;
      markCooperadoPagamentosHydrated();
      if (
        !cooperadoGaInicioSomenteCasca(user) &&
        (isCooperadoPwaMobileLeveUi() || isCooperadoPwaMessengerMode())
      ) {
        cooperadoRematerializarFinanceiroLocalSePossivel(user);
      } else if (!cooperadoGaInicioSomenteCasca(user)) {
        persistirInicioCardValorReceberCooperado(user);
      }
    };
    ensureCooperadoAppDataEagerWarm();
    if (isAppDataWarm()) run();
    else scheduleCooperadoPostInteractiveTask(run);
  }, [user, coopId, markCooperadoPagamentosHydrated]);

  /** Pull operacional cedo — alinha status confirmado/aguardando antes da UI financeira. */
  const hydrateCooperadoPagamentosFromCloud = useCallback(async (opts?: { ignoreGap?: boolean }) => {
    const currentUser = userRef.current;
    if (!currentUser || currentUser.role !== "cooperado") {
      markCooperadoPagamentosHydrated();
      return;
    }
    if (isCooperadoManualOperacionalSync()) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      /* H204: offline — readiness só via runSync + cooperadoApresentacaoFinanceiraPosRunSync */
      return;
    }
    if (typeof document !== "undefined" && document.hidden) return;
    if (votacaoOperacionalPullRef.current) return;

    const now = Date.now();
    if (
      !opts?.ignoreGap &&
      now - lastVotacaoOperacionalPullRef.current < VOTACAO_OPERACIONAL_PULL_GAP_MS
    ) {
      return;
    }

    const warm = await waitForAppDataWarm();
    if (!warm) {
      return;
    }

    if (isH197CaptureEnabled()) {
      h197ObserveLifecycleEvent(
        "warm_pre_sync",
        h197PassiveContext(currentUser, cooperadoPagamentosHydratedRef, syncingRef.current)
      );
    }

    const data = getData();
    const currentCoopId = getUserCooperativaId(currentUser, data);
    if (!currentCoopId) {
      return;
    }

    const sessionOk = await ensureCloudSessionReady(userToCloudProfile(currentUser));
    if (!sessionOk) {
      if (currentUser.role === "cooperado") {
        scheduleCooperadoSilentSyncRetry();
      } else {
        setLastSyncError(
          getLastCloudSyncError() ||
            "Não foi possível conectar à nuvem. Saia, entre de novo e aguarde alguns segundos."
        );
      }
      /* H204: readiness financeiro só após runSync completo — não liberar UI aqui. */
      return;
    }

    const cnpj = await resolveCooperativaCnpj(data, currentCoopId, currentUser);
    if (!cnpj) {
      return;
    }

    votacaoOperacionalPullRef.current = true;
    lastVotacaoOperacionalPullRef.current = now;
    if (isH197CaptureEnabled()) {
      h197ObserveLifecycleEvent(
        "hydrate_start",
        h197PassiveContext(currentUser, cooperadoPagamentosHydratedRef, syncingRef.current)
      );
    }
    try {
      const boundLease = getCooperadoRunSyncSessionLease();
      const result = await syncOperacionalFromCloud(cnpj, {
        sessionLease: boundLease ?? undefined,
      });
      const msg = mensagemErroPullOperacionalCooperado(result);
      if (msg && !boundLease) {
        const latest = getData();
        const cooperadoId =
          currentUser.cooperadoId &&
          resolverCooperadoIdCanonico(latest, currentUser.cooperadoId, currentCoopId);
        if (
          cooperadoId &&
          cooperadoFinanceiroDesatualizado(latest, cooperadoId, currentCoopId)
        ) {
          if (currentUser.role === "cooperado") {
            scheduleCooperadoSilentSyncRetry();
          } else {
            setLastSyncError(msg);
          }
        }
      }
    } catch {
      if (currentUser.role === "cooperado") {
        scheduleCooperadoSilentSyncRetry();
      }
    } finally {
      votacaoOperacionalPullRef.current = false;
      if (isH197CaptureEnabled()) {
        h197ObserveLifecycleEvent(
          "hydrate_end",
          h197PassiveContext(userRef.current, cooperadoPagamentosHydratedRef, syncingRef.current)
        );
      }
      /* H204: pull operacional parcial (votação) não marca apresentação pronta — só runSync. */
    }
  }, [markCooperadoPagamentosHydrated, scheduleCooperadoSilentSyncRetry, setLastSyncError]);

  const pullVotacaoOperacionalCooperado = useCallback(async () => {
    await hydrateCooperadoPagamentosFromCloud();
  }, [hydrateCooperadoPagamentosFromCloud]);

  const runSync = useCallback(async (incoming?: SyncRunOptions) => {
    const capped = staffGestaoPerfilCapSyncAutomatico(incoming);
    if (capped === null) return;
    const opts = capped ?? incoming;
    const userInitiatedRun = opts?.userInitiated === true;
    const currentUser = userRef.current;
    if (!currentUser) return;
    if (syncingRef.current) {
      if (userInitiatedRun && currentUser.role === "cooperado") {
        cooperadoUserRefreshQueuedRef.current = true;
        markCooperadoUserSyncVisible();
        setSyncing(true);
      }
      return;
    }
    if (
      currentUser.role === "cooperado" &&
      isCooperadoManualOperacionalSync() &&
      opts?.userInitiated !== true &&
      opts?.eventDriven !== true
    ) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const isStaffGestao =
      currentUser.role === "responsavel" ||
      currentUser.role === "tesoureiro" ||
      currentUser.role === "admin";

    if (
      isStaffGestao &&
      opts?.userInitiated !== true &&
      opts?.eventDriven !== true &&
      staffGestaoPausaTrabalhoPesadoAutomatico()
    ) {
      return;
    }

    if (!opts?.force && isAppIdle() && !isStaffGestao) return;

    let warm = await waitForAppDataWarm();
    if (!warm && userInitiatedRun) {
      preloadAppData({ eager: true });
      warm = await waitForAppDataWarm(12_000);
    }
    if (!warm) return;

    if (isH197CaptureEnabled()) {
      h197ObserveLifecycleEvent(
        "warm_pre_sync",
        h197PassiveContext(currentUser, cooperadoPagamentosHydratedRef, syncingRef.current)
      );
    }

    let data = getData();
    if (
      isStaffGestao &&
      (data.cooperados?.length ?? 0) === 0 &&
      (data.notasPedido?.length ?? 0) === 0 &&
      (data.fichaCorrida?.length ?? 0) === 0
    ) {
      try {
        const raw = readAppDataPersistRaw();
        if (raw && raw.length > 10_000) {
          data = refreshData();
        }
      } catch {
        /* storage */
      }
    }
    const currentCoopId = getUserCooperativaId(currentUser, data);
    if (!currentCoopId) {
      if (currentUser.role === "cooperado") {
        scheduleCooperadoSilentSyncRetry();
      } else {
        setLastSyncError("Cadastro da cooperativa não encontrado neste aparelho. Saia e entre de novo.");
      }
      return;
    }

    const now = Date.now();
    if (!opts?.force && now - lastSyncStartedAtRef.current < getSyncMinGapMs(currentUser.role)) return;
    lastSyncStartedAtRef.current = now;

    const cooperadoLogadoEarly = currentUser.role === "cooperado";
    const cooperadoSyncEmSegundoPlano =
      cooperadoLogadoEarly &&
      isCooperadoEventDrivenSync() &&
      opts?.eventDriven === true &&
      opts?.userInitiated !== true;
    const cooperadoUiSync =
      !cooperadoLogadoEarly ||
      !isCooperadoManualOperacionalSync() ||
      (opts?.userInitiated === true && !cooperadoSyncEmSegundoPlano);
    const staffGestaoUiSync =
      !isStaffGestao || opts?.userInitiated === true;
    const silentCooperadoOpen =
      cooperadoLogadoEarly &&
      isCooperadoInstantResumeEnabled() &&
      opts?.silent === true &&
      !isCooperadoUserSyncVisible();
    const silentStaffOpen =
      isStaffGestaoRole(currentUser.role) &&
      isCooperadoInstantResumeEnabled() &&
      opts?.silent === true;

    syncingRef.current = true;
    if (cooperadoUiSync && staffGestaoUiSync && !silentCooperadoOpen && !silentStaffOpen) {
      setSyncing(true);
    }
    setLastSyncError("");
    if (isH197CaptureEnabled()) {
      h197ObserveLifecycleEvent(
        "run_sync_start",
        h197PassiveContext(currentUser, cooperadoPagamentosHydratedRef, true)
      );
    }
    const eventDrivenRun = opts?.eventDriven === true;
    const cooperadoHadHydrationAtSyncStart =
      cooperadoLogadoEarly && cooperadoPagamentosHydratedRef.current;
    let completed = false;
    try {
      const sessionOk = await ensureCloudSessionReady(userToCloudProfile(currentUser));
      if (!sessionOk) {
        if (currentUser.role === "cooperado") {
          scheduleCooperadoSilentSyncRetry();
        } else {
          setLastSyncError(
            getLastCloudSyncError() ||
              "Não foi possível conectar à nuvem. Saia, entre de novo e aguarde alguns segundos."
          );
        }
        return;
      }

      const cnpj = await resolveCooperativaCnpj(data, currentCoopId, currentUser);
      if (!cnpj) {
        if (currentUser.role === "cooperado") {
          scheduleCooperadoSilentSyncRetry();
        } else {
          setLastSyncError("CNPJ da cooperativa não encontrado. Saia e entre de novo.");
        }
        return;
      }

      await flushPendingCooperadoPushes(cnpj);
      await runCooperadoDeliveryQueueMaintenance({ cnpj });
      await flushPendingNotaDeletes(cnpj);

      const cooperadoLogado = currentUser.role === "cooperado";
      let cooperadoSyncSession: CooperativaSyncSessionLease | undefined;

      if (cooperadoLogado) {
        const cooperadoCanonicoHydration =
          currentUser.cooperadoId &&
          resolverCooperadoIdCanonico(getData(), currentUser.cooperadoId, currentCoopId);
        const forceClearsHydration =
          Boolean(opts?.force) &&
          (!isCooperadoInstantResumeEnabled() ||
            !cooperadoLogado ||
            isCooperadoUserSyncVisible());
        const mustClearFinancePresentation =
          forceClearsHydration ||
          !cooperadoPagamentosHydratedRef.current ||
          (cooperadoCanonicoHydration
            ? cooperadoFinanceiroBloqueiaEntradaApp(
                getData(),
                cooperadoCanonicoHydration,
                currentCoopId
              )
            : true);
        const temFatiaFinanceiraLocal = Boolean(
          cooperadoCanonicoHydration &&
            cooperadoTemDadosFinanceirosMinimos(
              getData(),
              cooperadoCanonicoHydration,
              currentCoopId
            )
        );
        const preserveHydration =
          cooperadoSyncEmSegundoPlano ||
          cooperadoPreserveHydrationOnSilentSync(currentUser, cooperadoPagamentosHydratedRef.current) ||
          (opts?.userInitiated === true && temFatiaFinanceiraLocal);
        const limparHydrationFinanceira =
          mustClearFinancePresentation &&
          !preserveHydration &&
          (!isCooperadoManualOperacionalSync() ||
            (opts?.userInitiated === true && !temFatiaFinanceiraLocal));
        if (limparHydrationFinanceira) {
          setCooperadoPagamentosHydrated(false);
        }
      }

      const cooperadoAtualizarRapido =
        cooperadoLogado &&
        isCooperadoManualOperacionalSync() &&
        (opts?.userInitiated === true || opts?.eventDriven === true);

      await withSyncTimeout(
        (async () => {
          let antesCooperadoEntregasSync: ReturnType<typeof getData> | null = null;
          if (cooperadoLogado) {
            const cooperadoCanonico =
              currentUser.cooperadoId &&
              resolverCooperadoIdCanonico(getData(), currentUser.cooperadoId, currentCoopId);
            antesCooperadoEntregasSync = getData();
            cooperadoSyncSession = acquireCooperativaSyncSessionLease(cnpj);
            bindCooperadoRunSyncSessionLease(cooperadoSyncSession);
            if (cooperadoAtualizarRapido && cooperadoCanonico) {
              await syncCooperadoAtualizarFromCloud(cnpj, currentCoopId, cooperadoCanonico, {
                sessionLease: cooperadoSyncSession,
              });
            } else {
              await syncCooperativaBackground(cnpj, currentCoopId, cooperadoCanonico || undefined, {
                sessionLease: cooperadoSyncSession,
              });
            }
            if (cooperadoCanonico) {
              const aindaDesatualizado = cooperadoFinanceiroDesatualizado(
                getData(),
                cooperadoCanonico,
                currentCoopId
              );
              if (aindaDesatualizado) {
                const recovered = await ensureCooperadoFinanceiroFromCloud(
                  cnpj,
                  currentCoopId,
                  cooperadoCanonico,
                  { sessionLease: cooperadoSyncSession }
                );
                if (!recovered && cooperadoFinanceiroDesatualizado(getData(), cooperadoCanonico, currentCoopId)) {
                  if (
                    cooperadoFinanceiroStaleRecuperavelEmBackground(
                      getData(),
                      cooperadoCanonico,
                      currentCoopId
                    )
                  ) {
                    scheduleCooperadoSilentSyncRetry();
                  } else if (currentUser.role !== "cooperado") {
                    setLastSyncError(
                      getLastCloudSyncError() ||
                        "Não foi possível baixar sua ficha. Verifique a internet e toque em Atualizar agora."
                    );
                  } else {
                    scheduleCooperadoSilentSyncRetry();
                  }
                }
              }
            }
          } else {
            const pushCatalog = isDiretoriaRole(currentUser.role as UserRole);
            const pushMensalidades = isDiretoriaRole(currentUser.role as UserRole);
            const tier = opts?.tier ?? "operacional_full";
            const staffUserInitiated = opts?.userInitiated === true;
            const plan = expandStaffTierPlanIfOperacionalVazio(
              resolveSyncTierPlan84(tier, "staff"),
              getData(),
              currentCoopId,
              {
                staffLiveBackground: opts?.staffLiveBackground,
                staffUserInitiated,
              }
            );
            if (plan.bidirectionalFull) {
              await syncCooperativaBidirectional(cnpj, currentCoopId, { pushCatalog, pushMensalidades });
            } else {
              await syncStaffTieredPullFromCloud(cnpj, currentCoopId, tier, {
                staffLiveBackground: opts?.staffLiveBackground,
                staffUserInitiated,
              });
            }
            const { resetResponsavelPainelIndexCache } = await import(
              "@/services/responsavelPainelIndex"
            );
            resetResponsavelPainelIndexCache();
          }

          if (currentUser.role === "cooperado" && currentUser.cooperadoId) {
            const cooperadoCanonico = resolverCooperadoIdCanonico(
              getData(),
              currentUser.cooperadoId,
              currentCoopId
            );
            const posSyncCooperado = async () => {
              await refreshCooperadoNotasEmAnalise(cnpj, currentUser.cooperadoId!, currentCoopId, {
                sessionLease: cooperadoSyncSession,
              });
              await republishLocalAguardandoConferencia(cnpj, currentUser.cooperadoId!, currentCoopId);

              const depois = getData();
              if (antesCooperadoEntregasSync && cooperadoCanonico) {
                const totalApagadas = contarEntregasApagadasCooperadoNoSync(
                  antesCooperadoEntregasSync,
                  depois,
                  cooperadoCanonico,
                  currentCoopId
                );
                if (totalApagadas > 0) {
                  notifyCooperadoEntregasRemovidasPelaCooperativa(totalApagadas);
                }
              }

              const registro = depois.cooperados.find((c) => c.id === cooperadoCanonico);

              if (registro && now - lastCooperadoPushRef.current >= COOPERADO_PUSH_GAP_MS) {
                await pushCooperadoToCloud(cnpj, registro, currentUser.email);
                lastCooperadoPushRef.current = Date.now();
              }

              const cooperadoNome = getCooperadoNome(getData().cooperados, cooperadoCanonico);
              void runCooperadoFotoUploadsInBackground(cnpj, cooperadoCanonico, cooperadoNome, currentCoopId);
            };
            if (cooperadoAtualizarRapido) {
              void posSyncCooperado();
            } else {
              await posSyncCooperado();
            }
          }
        })(),
        "Sincronização",
        cooperadoAtualizarRapido ? COOPERADO_ATUALIZAR_TIMEOUT_MS : SYNC_TIMEOUT_MS
      );

      completed = true;

      if (!cooperadoLogado) {
        const align = await ensureOperacionalAlinhadoComNuvem(cnpj, currentCoopId);
        if (!align.ok) {
          setLastSyncError(align.message);
        }
      }

      if (cooperadoLogado && currentUser.cooperadoId) {
        const cooperadoCanonico = resolverCooperadoIdCanonico(
          getData(),
          currentUser.cooperadoId,
          currentCoopId
        );
        if (cooperadoCanonico) {
          const healed = aplicarSanidadeFinanceiroCooperadoLocal(getData(), cooperadoCanonico, currentCoopId);
          if (healed !== getData()) {
            saveAppDataIfSyncLeaseCurrent(cooperadoSyncSession, healed);
          }
        }
        if (
          cooperadoCanonico &&
          cooperadoFinanceiroDesatualizado(getData(), cooperadoCanonico, currentCoopId)
        ) {
          if (
            cooperadoFinanceiroStaleRecuperavelEmBackground(
              getData(),
              cooperadoCanonico,
              currentCoopId
            )
          ) {
            scheduleCooperadoSilentSyncRetry();
          } else if (
            currentUser.role === "cooperado" &&
            (opts?.userInitiated === true || opts?.eventDriven === true) &&
            cooperadoTemDadosFinanceirosMinimos(getData(), cooperadoCanonico, currentCoopId)
          ) {
            /* Toque em Atualizar: mostrar o que já baixou; reconciliação continua em background. */
            scheduleCooperadoSilentSyncRetry();
          } else {
            completed = false;
            if (currentUser.role !== "cooperado") {
              setLastSyncError((prev) =>
                prev ||
                "Não foi possível baixar sua ficha. Verifique a internet e toque em Atualizar agora."
              );
            } else {
              scheduleCooperadoSilentSyncRetry();
            }
          }
        }
      }
      const staffUser =
        currentUser.role === "responsavel" ||
        currentUser.role === "tesoureiro" ||
        currentUser.role === "admin";
      const refreshHb = (): Promise<void> => {
        if (isStaffConferenciaModalOpen()) return Promise.resolve();
        if (staffUser && !isStaffHbCoopBackgroundSyncRoute()) return Promise.resolve();
        return refreshContaCoopDescontosAfterOperacionalSync({
          cnpj,
          cooperativaId: currentCoopId,
          user: currentUser,
        });
      };
      const messengerCooperado = cooperadoLogado && isCooperadoPwaMessengerMode();
      if (cooperadoAtualizarRapido && !messengerCooperado) {
        void refreshHb();
      } else if (cooperadoAtualizarRapido && messengerCooperado) {
        await refreshHb();
      } else if (cooperadoLogado || opts?.force) {
        await refreshHb();
      } else {
        window.setTimeout(() => void refreshHb(), staffUser ? 14_000 : 2_500);
      }
    } catch (e) {
      if (!completed) {
        if (userRef.current?.role === "cooperado") {
          scheduleCooperadoSilentSyncRetry();
        } else {
          setLastSyncError(e instanceof Error ? e.message : "Erro na sincronização.");
        }
      }
    } finally {
      if (userRef.current?.role === "cooperado" && completed) {
        const coopIdFinal = getUserCooperativaId(userRef.current, getData());
        if (coopIdFinal) {
          try {
            const cnpjDone = await resolveCooperativaCnpj(getData(), coopIdFinal, userRef.current);
            if (cnpjDone) {
              const remote = await fetchCooperativaCloudRevision(cnpjDone);
              if (remote) {
                persistAppliedCooperativaCloudRevision(
                  cnpjDone,
                  fingerprintCooperativaCloudRevision(remote)
                );
              }
              persistOperacionalSyncedAppBuild();
            }
          } catch {
            /* revisão local — não bloqueia fim do sync */
          }
        }
      }
      if (completed && hasCooperadoEventDrivenGrant()) {
        consumeCooperadoEventDrivenSyncGrant();
      }
      if (completed && userRef.current) {
        const role = userRef.current.role;
        if (
          role === "cooperado" &&
          eventDrivenRun &&
          cooperadoHadHydrationAtSyncStart
        ) {
          notifyAppSubtleUpdate();
        } else if (silentStaffOpen && isStaffGestaoRole(role) && isAppDataWarm()) {
          notifyAppSubtleUpdate();
        }
      }
      bindCooperadoRunSyncSessionLease(null);
      const queuedCooperadoRefresh = cooperadoUserRefreshQueuedRef.current;
      cooperadoUserRefreshQueuedRef.current = false;
      syncingRef.current = false;
      const nowEnd = Date.now();
      const chainQueuedRefresh =
        queuedCooperadoRefresh &&
        userRef.current?.role === "cooperado" &&
        nowEnd - lastQueuedRefreshAtRef.current >= 12_000;
      if (chainQueuedRefresh) {
        lastQueuedRefreshAtRef.current = nowEnd;
      } else {
        setSyncing(false);
        if (userRef.current?.role === "cooperado") {
          resetCooperadoUserSyncVisible();
        }
      }
      const syncedAt = Date.now();
      setLastSyncedAt(syncedAt);
      if (userRef.current?.role === "cooperado" && completed) {
        persistCooperadoLastOperacionalSyncAt(syncedAt);
      }
      if (isH197CaptureEnabled()) {
        h197ObserveLifecycleEvent(
          "run_sync_end",
          h197PassiveContext(userRef.current, cooperadoPagamentosHydratedRef, false)
        );
        if (userRef.current?.role === "cooperado") {
          window.setTimeout(() => {
            h197ObserveLifecycleEvent(
              "steady_timer",
              h197PassiveContext(userRef.current, cooperadoPagamentosHydratedRef, false)
            );
          }, 3000);
        }
      }
      if (userRef.current?.role === "cooperado" && userRef.current.cooperadoId) {
        const latest = getData();
        const coopIdFinal = getUserCooperativaId(userRef.current, latest);
        const cooperadoCanonico =
          coopIdFinal &&
          resolverCooperadoIdCanonico(latest, userRef.current.cooperadoId, coopIdFinal);
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        const liberaApresentacao =
          cooperadoCanonico &&
          coopIdFinal &&
          cooperadoApresentacaoFinanceiraPosRunSync({
            syncCompleted: completed,
            offline,
            data: latest,
            cooperadoId: cooperadoCanonico,
            cooperativaId: coopIdFinal,
          });
        let apresentacaoFinanceiraRestaurada = false;
        const restaurarApresentacaoCooperado = () => {
          if (!userRef.current || userRef.current.role !== "cooperado") return;
          markCooperadoPagamentosHydrated();
          persistirInicioCardValorReceberCooperado(userRef.current);
          apresentacaoFinanceiraRestaurada = true;
          setLastSyncError("");
        };

        if (liberaApresentacao) {
          restaurarApresentacaoCooperado();
        } else if (
          cooperadoCanonico &&
          coopIdFinal &&
          completed &&
          !cooperadoFinanceiroDesatualizado(getData(), cooperadoCanonico, coopIdFinal)
        ) {
          restaurarApresentacaoCooperado();
        } else if (
          cooperadoCanonico &&
          coopIdFinal &&
          isCooperadoManualOperacionalSync() &&
          cooperadoPodeExibirFinanceiroLocalmente(latest, cooperadoCanonico, coopIdFinal)
        ) {
          restaurarApresentacaoCooperado();
        } else if (
          cooperadoCanonico &&
          coopIdFinal &&
          cooperadoFinanceiroStaleRecuperavelEmBackground(latest, cooperadoCanonico, coopIdFinal)
        ) {
          restaurarApresentacaoCooperado();
        } else if (
          cooperadoCanonico &&
          coopIdFinal &&
          completed &&
          cooperadoTemDadosFinanceirosMinimos(latest, cooperadoCanonico, coopIdFinal) &&
          !cooperadoFinanceiroBloqueiaEntradaApp(latest, cooperadoCanonico, coopIdFinal)
        ) {
          restaurarApresentacaoCooperado();
        } else if (!isCooperadoManualOperacionalSync()) {
          setCooperadoPagamentosHydrated(false);
        }

        if (
          userRef.current?.role === "cooperado" &&
          (isCooperadoPwaMobileLeveUi() || isCooperadoMobilePilotPerfActive(userRef.current)) &&
          (completed || apresentacaoFinanceiraRestaurada)
        ) {
          cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(userRef.current);
          empacotarModeloAparelhoJeferson(userRef.current);
          scheduleCooperadoHbCreditSyncPadrao(userRef.current);
          if (completed) {
            persistOperacionalSyncedAppBuild();
          }
          if (isCooperadoPwaMessengerMode()) {
            clearCooperadoPwaDadosDesatualizados();
          }
        }
      }
      if (chainQueuedRefresh) {
        queueMicrotask(() => {
          void runSync({ force: true, userInitiated: true });
        });
      }
    }
  }, [markCooperadoPagamentosHydrated, scheduleCooperadoSilentSyncRetry]);

  useEffect(() => {
    installH197WindowExport();
  }, []);

  useEffect(() => {
    if (!user?.id || !coopId) return;

    if (isH197CaptureEnabled() && user.role === "cooperado") {
      h197ObserveLifecycleEvent(
        "provider_mount_pre_warm",
        h197PassiveContext(user, cooperadoPagamentosHydratedRef, syncingRef.current)
      );
    }

    const stopIdle = startIdleMonitor();

    const unregisterVotacao = registerVotacaoOperacionalSyncHandler(() => {
      if (userRef.current?.role === "cooperado" && !cooperadoOperacionalSyncPermitido()) {
        return;
      }
      void pullVotacaoOperacionalCooperado();
    });

    const unregister = registerSyncHandler((runOpts) => {
      if (document.hidden) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (userRef.current?.role === "cooperado" && !cooperadoOperacionalSyncPermitido()) {
        return;
      }
      markUserActivity();
      void runSync({
        force: runOpts.force ?? false,
        silent: runOpts.silent,
        userInitiated: runOpts.userInitiated === true,
        eventDriven: runOpts.eventDriven === true,
        tier: runOpts.tier,
        staffLiveBackground: runOpts.staffLiveBackground === true,
      });
    });

    const staff =
      user?.role === "responsavel" ||
      user?.role === "tesoureiro" ||
      user?.role === "admin";

    const cooperadoSemAutoSync =
      user?.role === "cooperado" &&
      (isCooperadoManualOperacionalSync() || isCooperadoEventDrivenSync());

    let initialDelay: ReturnType<typeof setTimeout> | undefined;
    if (cooperadoSemAutoSync) {
      const deferReleaseOnOpen =
        user?.role === "cooperado" && cooperadoMobileDeferOperacionalSyncNaAbertura(user);
      const needsAutoRelease =
        user?.role === "cooperado" &&
        !deferReleaseOnOpen &&
        (cooperadoAppReleaseNeedsOperacionalSync() ||
          (isCooperadoPwaMessengerMode() &&
            cooperadoPwaMessengerPrecisaSyncOperacionalInicial(user)));

      if (needsAutoRelease) {
        if (isCooperadoPwaMessengerMode()) {
          scheduleCooperadoPostShellSync(() => {
            markCooperadoUserSyncVisible();
            prepararFinanceiroLocalCooperado(user);
            requestCooperadoAppReleaseSync();
          });
        } else {
          prepararFinanceiroLocalCooperado(user);
          requestCooperadoAppReleaseSync();
        }
      } else if (user?.role === "cooperado" && !document.hidden) {
        scheduleCooperadoPostShellSync(() => {
          prepararFinanceiroLocalCooperado(user);
          if (isCooperadoPwaMessengerMode() || deferReleaseOnOpen) {
            if (
              deferReleaseOnOpen &&
              cooperadoAppReleaseNeedsOperacionalSync() &&
              !cooperadoGaInicioSomenteCasca(user)
            ) {
              scheduleCooperadoGaPrimeiraCargaSilenciosa(user);
            }
            scheduleCooperadoMessengerStaffRevisionPull(user, coopId);
            return;
          }
          void resolveCooperativaCnpj(getData(), coopId, user).then((cnpjOpen) => {
            if (!cnpjOpen || document.hidden) return;
            void runCooperadoForegroundOperacionalCheck(cnpjOpen);
          });
        });
      }
    } else if (user?.role === "cooperado" && isCooperadoInstantResumeEnabled()) {
      if (
        cooperadoAppReleaseNeedsOperacionalSync() &&
        !cooperadoMobileDeferOperacionalSyncNaAbertura(user)
      ) {
        prepararFinanceiroLocalCooperado(user);
        requestCooperadoAppReleaseSync();
      } else if (user?.role === "cooperado" && cooperadoMobileDeferOperacionalSyncNaAbertura(user)) {
        scheduleCooperadoPostShellSync(() => prepararFinanceiroLocalCooperado(user));
      } else if (!document.hidden) {
        markUserActivity();
        scheduleCooperadoColdStartSync(() => {
          scheduleCooperadoPostShellSync(() => {
            void runSync({ force: true, silent: true });
          });
        });
      }
    } else if (staff && isCooperadoInstantResumeEnabled()) {
      if (!document.hidden && staffGestaoPerfilAberturaSyncPermitido()) {
        markUserActivity();
        const runStaffOpen = () => {
          markNextCooperadoSyncSilent();
          void runSync(staffResponsavelOpeningSyncRequest(isAppDataWarm() ? getData() : null));
        };
        const delayOpen = staffGestaoAberturaSyncDelayMs();
        scheduleStaffPostInteractiveTask(() => {
          if (delayOpen <= 0) runStaffOpen();
          else window.setTimeout(runStaffOpen, delayOpen);
        });
      }
    } else if (staff && staffGestaoPerfilAberturaSyncPermitido()) {
      const delayOpen = staffGestaoAberturaSyncDelayMs();
      initialDelay = setTimeout(() => {
        if (!document.hidden) {
          markUserActivity();
          void runSync(staffResponsavelOpeningSyncRequest(isAppDataWarm() ? getData() : null));
        }
      }, delayOpen);
    } else {
      initialDelay = setTimeout(() => {
        if (!document.hidden) {
          markUserActivity();
          void runSync({ force: user?.role === "cooperado" });
        }
      }, user?.role === "cooperado" ? 0 : 400);
    }

    const unsubIdle = onAppIdleChange((nowIdle) => {
      if (nowIdle) return;
      if (document.hidden) return;
      if (cooperadoSemAutoSync) return;
      if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
      if (staff && Date.now() - lastSyncStartedAtRef.current < getSyncMinGapMs(user?.role ?? "cooperado")) {
        return;
      }
      if (staff && !staffGestaoSyncBackgroundPermitido()) return;
      const staffOpts = staff
        ? staffResponsavelLifecycleSyncRequestLive(isAppDataWarm() ? getData() : null)
        : undefined;
      void runSync(staffOpts);
    });

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (cooperadoSemAutoSync) {
        if (user?.role === "cooperado") {
          scheduleCooperadoPwaOperacionalParidadePull(userRef.current, coopId);
          scheduleCooperadoMessengerStaffRevisionPull(userRef.current, coopId);
        }
        return;
      }
      markUserActivity();
      if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
      if (staff && !staffGestaoSyncBackgroundPermitido()) return;
      if (staff && Date.now() - lastSyncStartedAtRef.current < getSyncMinGapMs(user?.role ?? "cooperado")) {
        return;
      }
      const staffOpts = staff
        ? staffResponsavelLifecycleSyncRequestLive(isAppDataWarm() ? getData() : null)
        : undefined;
      void runSync(staffOpts);
    };
    document.addEventListener("visibilitychange", onVisible);

    const onOnline = () => {
      if (document.hidden) return;
      if (cooperadoSemAutoSync) {
        if (user?.role === "cooperado") {
          scheduleCooperadoPwaOperacionalParidadePull(userRef.current, coopId, { force: true });
          scheduleCooperadoMessengerStaffRevisionPull(userRef.current, coopId);
        }
        return;
      }
      markUserActivity();
      if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
      if (staff && !staffGestaoSyncBackgroundPermitido()) return;
      const staffOpts = staff
        ? staffResponsavelLifecycleSyncRequestLive(isAppDataWarm() ? getData() : null)
        : undefined;
      void runSync(staffOpts);
    };
    window.addEventListener("online", onOnline);

    return () => {
      unregisterVotacao();
      unregister();
      unsubIdle();
      stopIdle();
      if (initialDelay) clearTimeout(initialDelay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [coopId, user?.id, user?.role, runSync, pullVotacaoOperacionalCooperado, hydrateCooperadoPagamentosFromCloud]);

  const staffGestaoLive =
    user?.role === "responsavel" || user?.role === "tesoureiro" || user?.role === "admin";

  useEffect(() => {
    if (!staffGestaoLive || !coopId) return;
    if (!isStaffGestaoLiveSyncEnabled()) return;
    const intervalMs = resolveStaffGestaoLiveSyncIntervalMs(pathname ?? "");
    if (intervalMs <= 0) return;

    const tick = () => {
      if (document.hidden) return;
      if (shouldBlockStaffAutoSyncDuringConferencia()) return;
      if (staffGestaoPausaTrabalhoPesadoAutomatico()) return;
      void runSync(staffResponsavelLiveSyncTickRequest(pathname ?? "", getData()));
    };

    return scheduleStaffGestaoLiveSyncLoop({
      pollIntervalMs: intervalMs,
      onPoll: tick,
      onVisible: () => undefined,
    });
  }, [staffGestaoLive, coopId, pathname, runSync]);

  useEffect(() => {
    if (!staffGestaoLive || !coopId) return;
    if (!staffGestaoSyncBackgroundPermitido()) return;
    if (!isStaffFilaNotasLivePollEnabled()) return;
    const onConferir = (pathname ?? "").startsWith("/notas-pedido");
    const intervalMs = resolveStaffFilaBackgroundCatchupMs(onConferir);
    if (intervalMs <= 0) return;

    const tick = () => {
      if (document.hidden) return;
      if (staffGestaoPausaTrabalhoPesadoAutomatico()) return;
      const d = getData();
      if (!d) return;
      const cnpj = getCooperativaCnpj(d, coopId);
      if (!cnpj) return;
      void syncStaffFilaConferenciaLiveFromCloud(cnpj);
    };

    const first = window.setTimeout(tick, 1_200);
    const interval = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.hidden) return;
      tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [staffGestaoLive, coopId, pathname]);

  useEffect(() => {
    if (!user?.id || user.role !== "cooperado") return;
    if (isCooperadoPwaMessengerMode()) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribe(() => {
      const current = userRef.current;
      if (!current || current.role !== "cooperado") return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        avaliarIntegridadeFinanceiroCooperado(getData(), current);
      }, 500);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsub();
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role === "cooperado" && cooperadoLocalResumeReady(user)) {
      markCooperadoPagamentosHydrated();
      markRqlColdStartPhase("local_resume_ready");
    }
  }, [user?.id, user?.role, markCooperadoPagamentosHydrated]);

  const [cooperadoCnpj, setCooperadoCnpj] = useState<string | null>(null);
  useEffect(() => {
    if (user?.role !== "cooperado" || !coopId || !user) {
      setCooperadoCnpj(null);
      return;
    }
    let cancelled = false;
    void resolveCooperativaCnpj(getData(), coopId, user).then((cnpj) => {
      if (!cancelled) setCooperadoCnpj(cnpj ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, coopId]);

  useEffect(() => {
    if (user?.role !== "cooperado") return;
    ensureCooperadoDeliveryQueueOnlineListener(cooperadoCnpj ?? undefined);
  }, [user?.role, cooperadoCnpj]);

  useCooperadoStaffRevisionWatch({
    cnpj: cooperadoCnpj,
    cooperadoId: user?.cooperadoId,
    cooperativaId: coopId,
    enabled: user?.role === "cooperado" && isCooperadoEventDrivenSync(),
    syncing,
  });

  const syncingForUi = cooperadoSyncVisibleInUi(user?.role, syncing);

  /** Cooperado: sync em silêncio — erros só para staff (banner no início / diagnóstico). */
  const lastSyncErrorPublic =
    user?.role === "cooperado" ? "" : lastSyncError;

  const status = useMemo(
    () => ({
      syncing,
      syncingForUi,
      lastSyncedAt,
      lastSyncError: lastSyncErrorPublic,
      cooperadoPagamentosHydrated,
    }),
    [syncing, syncingForUi, lastSyncedAt, lastSyncErrorPublic, cooperadoPagamentosHydrated]
  );

  return (
    <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
  );
}
