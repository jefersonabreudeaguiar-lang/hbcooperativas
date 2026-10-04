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
} from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  resolveCooperativaCnpj,
  pushNotasPedidoToCloud,
  pushNotaComFotosEmStreaming,
  flushPendingNotaDeletes,
  fetchNotaPedidoFromCloud,
  finalizeNotaEntregaNaNuvem,
  refreshCooperadoNotasEmAnalise,
  republishLocalAguardandoConferencia,
  syncOfflineDeliveryImages,
} from "@/services/notaPedidoCloudService";
import {
  getSyncMinGapMs,
  ensureCooperadoFinanceiroFromCloud,
  syncCooperativaBackground,
  syncCooperativaBidirectional,
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
import {
  cooperadoFinanceiroBloqueiaEntradaApp,
  cooperadoFinanceiroDesatualizado,
  aplicarSanidadeFinanceiroCooperadoLocal,
} from "@/services/fichaSyncGuard";
import { avaliarIntegridadeFinanceiroCooperado } from "@/services/cooperadoFinanceiroGuard";
import { ensureOperacionalAlinhadoComNuvem } from "@/services/operacionalRestoreService";
import { refreshContaCoopDescontosAfterOperacionalSync } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { isStaffHbCoopBackgroundSyncRoute } from "@/lib/hb-credit/staffHbSyncRoute";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { pushCooperadoToCloud, resolverCooperadoIdCanonico, flushPendingCooperadoPushes, notaPertenceCooperado } from "@/services/cooperadoCloudService";
import { registerSyncHandler, registerVotacaoOperacionalSyncHandler } from "@/services/syncRequest";
import {
  isAppIdle,
  markUserActivity,
  onAppIdleChange,
  startIdleMonitor,
} from "@/services/idleActivity";
import { getData, saveDataSafe, subscribe, updateDataSafe, waitForAppDataWarm } from "@/services/dataStore";
import {
  ensureCloudSessionReady,
  getLastCloudSyncError,
  userToCloudProfile,
} from "@/lib/security/clientSession";
import { getCooperadoNome } from "@/utils/calculations";
import { readNotaFotoAtIndex, resolveNotaFotosForUpload } from "@/services/localMediaStore";
import { compactarFotosNoArmazenamento, contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { isDiretoriaRole } from "@/permissions";
import type { UserRole } from "@/types";
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
  cooperadoOperacionalSyncPermitido,
  isCooperadoInstantResumeEnabled,
  isCooperadoManualOperacionalSync,
  isCooperadoUserSyncVisible,
  resetCooperadoUserSyncVisible,
  scheduleCooperadoColdStartSync,
} from "@/lib/performance/cooperadoColdStart";
import { markRqlColdStartPhase } from "@/lib/performance/rqlMarks";
import type { SyncRunOptions } from "@/services/syncRequest";

const COOPERADO_PUSH_GAP_MS = 5 * 60 * 1000;
/** Intervalo mínimo entre pulls de operacional só para votação (bem menor que sync completa). */
const VOTACAO_OPERACIONAL_PULL_GAP_MS = 45_000;
/** Evita sync infinita — libera o chip "Atualizando…" mesmo em cooperativas grandes. */
const SYNC_TIMEOUT_MS = 90_000;

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

function withSyncTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} demorou demais. Tente de novo em instantes.`)),
        SYNC_TIMEOUT_MS
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
 * Sync sob demanda (pacote economia Edge Requests):
 * — ao abrir o app / voltar para a aba
 * — ao acordar da ociosidade (usuário mexeu de novo)
 * — após ações (requestAppSync)
 * Sem intervalo periódico enquanto o app fica aberto.
 */
export function CooperativaSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === "cooperado" && isCooperadoInstantResumeEnabled()) {
      ensureCooperadoAppDataEagerWarm();
      markRqlColdStartPhase("eager_warm");
    }
  }, [user?.id, user?.role]);

  const syncingRef = useRef(false);
  const lastSyncStartedAtRef = useRef(0);
  const lastCooperadoPushRef = useRef(0);
  const lastVotacaoOperacionalPullRef = useRef(0);
  const votacaoOperacionalPullRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState("");
  const [cooperadoPagamentosHydrated, setCooperadoPagamentosHydrated] = useState(
    () => user?.role !== "cooperado"
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
    if (isCooperadoManualOperacionalSync()) {
      setCooperadoPagamentosHydrated(true);
      return;
    }
    setCooperadoPagamentosHydrated(false);
  }, [user?.id, user?.role]);

  const markCooperadoPagamentosHydrated = useCallback(() => {
    setCooperadoPagamentosHydrated(true);
  }, []);

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
      setLastSyncError(
        getLastCloudSyncError() ||
          "Não foi possível conectar à nuvem. Saia, entre de novo e aguarde alguns segundos."
      );
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
          setLastSyncError(msg);
        }
      }
    } catch {
      /* offline / retry na próxima abertura */
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
  }, [markCooperadoPagamentosHydrated, setLastSyncError]);

  const pullVotacaoOperacionalCooperado = useCallback(async () => {
    await hydrateCooperadoPagamentosFromCloud();
  }, [hydrateCooperadoPagamentosFromCloud]);

  const runSync = useCallback(async (opts?: SyncRunOptions) => {
    const currentUser = userRef.current;
    if (!currentUser || syncingRef.current) return;
    if (
      currentUser.role === "cooperado" &&
      isCooperadoManualOperacionalSync() &&
      !isCooperadoUserSyncVisible()
    ) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const isStaffGestao =
      currentUser.role === "responsavel" ||
      currentUser.role === "tesoureiro" ||
      currentUser.role === "admin";

    if (!opts?.force && isAppIdle() && !isStaffGestao) return;

    const warm = await waitForAppDataWarm();
    if (!warm) return;

    if (isH197CaptureEnabled()) {
      h197ObserveLifecycleEvent(
        "warm_pre_sync",
        h197PassiveContext(currentUser, cooperadoPagamentosHydratedRef, syncingRef.current)
      );
    }

    const data = getData();
    const currentCoopId = getUserCooperativaId(currentUser, data);
    if (!currentCoopId) {
      if (currentUser.role === "cooperado") {
        setLastSyncError("Cadastro da cooperativa não encontrado neste aparelho. Saia e entre de novo.");
      }
      return;
    }

    const now = Date.now();
    if (!opts?.force && now - lastSyncStartedAtRef.current < getSyncMinGapMs(currentUser.role)) return;
    lastSyncStartedAtRef.current = now;

    const cooperadoLogadoEarly = currentUser.role === "cooperado";
    const cooperadoUiSync =
      !cooperadoLogadoEarly ||
      !isCooperadoManualOperacionalSync() ||
      isCooperadoUserSyncVisible();
    const silentCooperadoOpen =
      cooperadoLogadoEarly &&
      isCooperadoInstantResumeEnabled() &&
      opts?.silent === true &&
      !isCooperadoUserSyncVisible();

    syncingRef.current = true;
    if (cooperadoUiSync && !silentCooperadoOpen) {
      setSyncing(true);
    }
    setLastSyncError("");
    if (isH197CaptureEnabled()) {
      h197ObserveLifecycleEvent(
        "run_sync_start",
        h197PassiveContext(currentUser, cooperadoPagamentosHydratedRef, true)
      );
    }
    let completed = false;
    try {
      const sessionOk = await ensureCloudSessionReady(userToCloudProfile(currentUser));
      if (!sessionOk) {
        setLastSyncError(
          getLastCloudSyncError() ||
            "Não foi possível conectar à nuvem. Saia, entre de novo e aguarde alguns segundos."
        );
        return;
      }

      const cnpj = await resolveCooperativaCnpj(data, currentCoopId, currentUser);
      if (!cnpj) {
        if (currentUser.role === "cooperado") {
          setLastSyncError("CNPJ da cooperativa não encontrado. Saia e entre de novo.");
        }
        return;
      }

      await flushPendingCooperadoPushes(cnpj);
      await syncOfflineDeliveryImages();
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
        const preserveHydration = cooperadoPreserveHydrationOnSilentSync(
          currentUser,
          cooperadoPagamentosHydratedRef.current
        );
        if (mustClearFinancePresentation && !preserveHydration) {
          setCooperadoPagamentosHydrated(false);
        }
      }

      await withSyncTimeout(
        (async () => {
          if (cooperadoLogado) {
            const cooperadoCanonico =
              currentUser.cooperadoId &&
              resolverCooperadoIdCanonico(getData(), currentUser.cooperadoId, currentCoopId);
            cooperadoSyncSession = acquireCooperativaSyncSessionLease(cnpj);
            bindCooperadoRunSyncSessionLease(cooperadoSyncSession);
            await syncCooperativaBackground(cnpj, currentCoopId, cooperadoCanonico || undefined, {
              sessionLease: cooperadoSyncSession,
            });
            if (cooperadoCanonico) {
              const recovered = await ensureCooperadoFinanceiroFromCloud(
                cnpj,
                currentCoopId,
                cooperadoCanonico,
                { sessionLease: cooperadoSyncSession }
              );
              if (
                !recovered &&
                cooperadoFinanceiroDesatualizado(getData(), cooperadoCanonico, currentCoopId)
              ) {
                setLastSyncError(
                  getLastCloudSyncError() ||
                    "Não foi possível baixar sua ficha. Verifique a internet e toque em Atualizar agora."
                );
              }
            }
          } else {
            const pushCatalog = isDiretoriaRole(currentUser.role as UserRole);
            const pushMensalidades = isDiretoriaRole(currentUser.role as UserRole);
            await syncCooperativaBidirectional(cnpj, currentCoopId, { pushCatalog, pushMensalidades });
          }

          if (currentUser.role === "cooperado" && currentUser.cooperadoId) {
            const latest = getData();
            const cooperadoCanonico = resolverCooperadoIdCanonico(latest, currentUser.cooperadoId, currentCoopId);
            await refreshCooperadoNotasEmAnalise(cnpj, currentUser.cooperadoId, currentCoopId, {
              sessionLease: cooperadoSyncSession,
            });
            await republishLocalAguardandoConferencia(cnpj, currentUser.cooperadoId, currentCoopId);

            const registro = latest.cooperados.find((c) => c.id === cooperadoCanonico);

            if (registro && now - lastCooperadoPushRef.current >= COOPERADO_PUSH_GAP_MS) {
              await pushCooperadoToCloud(cnpj, registro, currentUser.email);
              lastCooperadoPushRef.current = Date.now();
            }

            const cooperadoNome = getCooperadoNome(latest.cooperados, cooperadoCanonico);
            void runCooperadoFotoUploadsInBackground(cnpj, cooperadoCanonico, cooperadoNome, currentCoopId);
          }
        })(),
        "Sincronização"
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
          completed = false;
          setLastSyncError((prev) =>
            prev ||
            "Não foi possível baixar sua ficha. Verifique a internet e toque em Atualizar agora."
          );
        }
      }
      const staffUser =
        currentUser.role === "responsavel" ||
        currentUser.role === "tesoureiro" ||
        currentUser.role === "admin";
      const refreshHb = () => {
        if (staffUser && !isStaffHbCoopBackgroundSyncRoute()) return;
        void refreshContaCoopDescontosAfterOperacionalSync({
          cnpj,
          cooperativaId: currentCoopId,
          user: currentUser,
        });
      };
      if (cooperadoLogado || opts?.force) {
        await refreshHb();
      } else {
        window.setTimeout(refreshHb, staffUser ? 8_000 : 2_500);
      }
    } catch (e) {
      if (!completed) {
        setLastSyncError(e instanceof Error ? e.message : "Erro na sincronização.");
      }
    } finally {
      bindCooperadoRunSyncSessionLease(null);
      syncingRef.current = false;
      setSyncing(false);
      if (userRef.current?.role === "cooperado") {
        resetCooperadoUserSyncVisible();
      }
      setLastSyncedAt(Date.now());
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
        if (liberaApresentacao) {
          markCooperadoPagamentosHydrated();
          persistirInicioCardValorReceberCooperado(userRef.current);
          setLastSyncError("");
        } else if (
          cooperadoCanonico &&
          coopIdFinal &&
          completed &&
          !cooperadoFinanceiroDesatualizado(getData(), cooperadoCanonico, coopIdFinal)
        ) {
          markCooperadoPagamentosHydrated();
          setLastSyncError("");
        } else if (!isCooperadoManualOperacionalSync()) {
          setCooperadoPagamentosHydrated(false);
        }
      }
    }
  }, [markCooperadoPagamentosHydrated]);

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
      });
    });

    const staff =
      user?.role === "responsavel" ||
      user?.role === "tesoureiro" ||
      user?.role === "admin";

    const cooperadoSemAutoSync = user?.role === "cooperado" && isCooperadoManualOperacionalSync();

    let initialDelay: ReturnType<typeof setTimeout> | undefined;
    if (cooperadoSemAutoSync) {
      /* Sync operacional só via botão Atualizar (HB Créditos fora deste fluxo). */
    } else if (user?.role === "cooperado" && isCooperadoInstantResumeEnabled()) {
      if (!document.hidden) {
        markUserActivity();
        scheduleCooperadoColdStartSync(() => {
          void runSync({ force: true, silent: true });
        });
      }
    } else {
      initialDelay = setTimeout(() => {
        if (!document.hidden) {
          markUserActivity();
          void runSync({ force: staff || user?.role === "cooperado" });
        }
      }, user?.role === "cooperado" ? 0 : 400);
    }

    const unsubIdle = onAppIdleChange((nowIdle) => {
      if (nowIdle) return;
      if (document.hidden) return;
      if (cooperadoSemAutoSync) return;
      if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
      void runSync();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (cooperadoSemAutoSync) return;
        markUserActivity();
        if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
        void runSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const onOnline = () => {
      if (document.hidden) return;
      if (cooperadoSemAutoSync) return;
      markUserActivity();
      if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
      void runSync();
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

  useEffect(() => {
    if (!user?.id || user.role !== "cooperado") return;
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

  const syncingForUi = cooperadoSyncVisibleInUi(user?.role, syncing);

  const status = useMemo(
    () => ({
      syncing,
      syncingForUi,
      lastSyncedAt,
      lastSyncError,
      cooperadoPagamentosHydrated,
    }),
    [syncing, syncingForUi, lastSyncedAt, lastSyncError, cooperadoPagamentosHydrated]
  );

  return (
    <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
  );
}
