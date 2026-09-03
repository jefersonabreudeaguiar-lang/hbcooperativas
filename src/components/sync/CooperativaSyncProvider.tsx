"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
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
} from "@/services/cooperativaSyncCloudService";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import { avaliarIntegridadeFinanceiroCooperado } from "@/services/cooperadoFinanceiroGuard";
import { pushCooperadoToCloud, resolverCooperadoIdCanonico, flushPendingCooperadoPushes } from "@/services/cooperadoCloudService";
import { registerSyncHandler, registerVotacaoOperacionalSyncHandler } from "@/services/syncRequest";
import {
  isAppIdle,
  markUserActivity,
  onAppIdleChange,
  startIdleMonitor,
} from "@/services/idleActivity";
import { getData, subscribe, updateDataSafe, waitForAppDataWarm } from "@/services/dataStore";
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

const COOPERADO_PUSH_GAP_MS = 5 * 60 * 1000;
/** Intervalo mínimo entre pulls de operacional só para votação (bem menor que sync completa). */
const VOTACAO_OPERACIONAL_PULL_GAP_MS = 25_000;

/** Upload/finalização de fotos do cooperado — roda após liberar o indicador “Atualizando…”. */
async function runCooperadoFotoUploadsInBackground(
  cnpj: string,
  cooperadoCanonico: string,
  cooperadoNome: string
): Promise<void> {
  const latest = getData();

  const pendentes = latest.notasPedido.filter(
    (n) =>
      n.cooperadoId === cooperadoCanonico &&
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
  const aguardandoLocal = afterUpload.notasPedido.filter(
    (n) =>
      n.cooperadoId === cooperadoCanonico &&
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
  const incompletasNaNuvem = afterFinalize.notasPedido.filter(
    (n) =>
      n.cooperadoId === cooperadoCanonico &&
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
  /** Timestamp da última sync concluída (sucesso ou tentativa com fim). */
  lastSyncedAt: number | null;
  /** Erro da última tentativa (sessão nuvem, permissão, etc.). */
  lastSyncError: string;
};

const SyncStatusContext = createContext<SyncStatusValue>({
  syncing: false,
  lastSyncedAt: null,
  lastSyncError: "",
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

  const coopId =
    user && typeof window !== "undefined"
      ? getUserCooperativaId(user, getData())
      : user?.cooperativaId;

  const pullVotacaoOperacionalCooperado = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || currentUser.role !== "cooperado") return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (votacaoOperacionalPullRef.current) return;

    const now = Date.now();
    if (now - lastVotacaoOperacionalPullRef.current < VOTACAO_OPERACIONAL_PULL_GAP_MS) return;

    const warm = await waitForAppDataWarm();
    if (!warm) return;

    const data = getData();
    const currentCoopId = getUserCooperativaId(currentUser, data);
    if (!currentCoopId) return;

    const sessionOk = await ensureCloudSessionReady(userToCloudProfile(currentUser));
    if (!sessionOk) return;

    const cnpj = await resolveCooperativaCnpj(data, currentCoopId, currentUser);
    if (!cnpj) return;

    votacaoOperacionalPullRef.current = true;
    lastVotacaoOperacionalPullRef.current = now;
    try {
      await syncOperacionalFromCloud(cnpj);
    } catch {
      /* offline / retry na próxima abertura */
    } finally {
      votacaoOperacionalPullRef.current = false;
    }
  }, []);

  const runSync = useCallback(async (opts?: { force?: boolean }) => {
    const currentUser = userRef.current;
    if (!currentUser || syncingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!opts?.force && isAppIdle()) return;

    const warm = await waitForAppDataWarm();
    if (!warm) return;

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

    syncingRef.current = true;
    setSyncing(true);
    setLastSyncError("");
    let completed = false;
    let fotoUploadBackground: {
      cnpj: string;
      cooperadoCanonico: string;
      cooperadoNome: string;
    } | null = null;
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

      if (cooperadoLogado) {
        const cooperadoCanonico =
          currentUser.cooperadoId &&
          resolverCooperadoIdCanonico(getData(), currentUser.cooperadoId, currentCoopId);
        await syncCooperativaBackground(cnpj, currentCoopId, cooperadoCanonico || undefined);
        if (cooperadoCanonico) {
          const recovered = await ensureCooperadoFinanceiroFromCloud(
            cnpj,
            currentCoopId,
            cooperadoCanonico
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
        await refreshCooperadoNotasEmAnalise(cnpj, currentUser.cooperadoId, currentCoopId);
        // Garante que entregas "em análise" locais estejam publicadas na nuvem
        // (visíveis para o responsável) após trocar de aba / sync.
        await republishLocalAguardandoConferencia(cnpj, currentUser.cooperadoId, currentCoopId);

        const registro = latest.cooperados.find((c) => c.id === cooperadoCanonico);

        if (registro && now - lastCooperadoPushRef.current >= COOPERADO_PUSH_GAP_MS) {
          await pushCooperadoToCloud(cnpj, registro, currentUser.email);
          lastCooperadoPushRef.current = Date.now();
        }

        fotoUploadBackground = {
          cnpj,
          cooperadoCanonico,
          cooperadoNome: getCooperadoNome(latest.cooperados, cooperadoCanonico),
        };
      }
      completed = true;
      if (cooperadoLogado && currentUser.cooperadoId) {
        const cooperadoCanonico = resolverCooperadoIdCanonico(
          getData(),
          currentUser.cooperadoId,
          currentCoopId
        );
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
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      if (completed) setLastSyncedAt(Date.now());
    }

    if (fotoUploadBackground) {
      void runCooperadoFotoUploadsInBackground(
        fotoUploadBackground.cnpj,
        fotoUploadBackground.cooperadoCanonico,
        fotoUploadBackground.cooperadoNome
      );
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !coopId) return;

    const stopIdle = startIdleMonitor();

    const unregisterVotacao = registerVotacaoOperacionalSyncHandler(() => {
      void pullVotacaoOperacionalCooperado();
    });

    const unregister = registerSyncHandler((force) => {
      if (document.hidden) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      markUserActivity();
      void runSync({ force: force ?? false });
    });

    const initialDelay = setTimeout(() => {
      if (!document.hidden) {
        markUserActivity();
        if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
        void runSync();
      }
    }, user?.role === "cooperado" ? 0 : 400);

    const unsubIdle = onAppIdleChange((nowIdle) => {
      if (nowIdle) return;
      if (document.hidden) return;
      if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
      void runSync();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markUserActivity();
        if (user?.role === "cooperado") void pullVotacaoOperacionalCooperado();
        void runSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const onOnline = () => {
      if (document.hidden) return;
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
      clearTimeout(initialDelay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [coopId, user?.id, user?.role, runSync, pullVotacaoOperacionalCooperado]);

  useEffect(() => {
    if (!user?.id || user.role !== "cooperado") return;
    return subscribe(() => {
      const current = userRef.current;
      if (!current || current.role !== "cooperado") return;
      avaliarIntegridadeFinanceiroCooperado(getData(), current);
    });
  }, [user?.id, user?.role]);

  const status = useMemo(
    () => ({ syncing, lastSyncedAt, lastSyncError }),
    [syncing, lastSyncedAt, lastSyncError]
  );

  return (
    <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
  );
}
