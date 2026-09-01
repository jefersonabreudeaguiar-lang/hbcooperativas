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
  syncCooperativaBackground,
  syncCooperativaBidirectional,
} from "@/services/cooperativaSyncCloudService";
import { pushCooperadoToCloud, resolverCooperadoIdCanonico, flushPendingCooperadoPushes } from "@/services/cooperadoCloudService";
import { registerSyncHandler } from "@/services/syncRequest";
import {
  isAppIdle,
  markUserActivity,
  onAppIdleChange,
  startIdleMonitor,
} from "@/services/idleActivity";
import { getData, updateDataSafe, waitForAppDataWarm } from "@/services/dataStore";
import { getCooperadoNome } from "@/utils/calculations";
import { readNotaFotoAtIndex, resolveNotaFotosForUpload } from "@/services/localMediaStore";
import { compactarFotosNoArmazenamento, contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { isDiretoriaRole } from "@/permissions";
import type { UserRole } from "@/types";

const COOPERADO_PUSH_GAP_MS = 5 * 60 * 1000;

export type SyncStatusValue = {
  syncing: boolean;
  /** Timestamp da última sync concluída (sucesso ou tentativa com fim). */
  lastSyncedAt: number | null;
};

const SyncStatusContext = createContext<SyncStatusValue>({
  syncing: false,
  lastSyncedAt: null,
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
  const userRef = useRef(user);
  userRef.current = user;

  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const coopId =
    user && typeof window !== "undefined"
      ? getUserCooperativaId(user, getData())
      : user?.cooperativaId;

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
    if (!currentCoopId) return;

    const now = Date.now();
    if (now - lastSyncStartedAtRef.current < getSyncMinGapMs()) return;
    lastSyncStartedAtRef.current = now;

    syncingRef.current = true;
    setSyncing(true);
    let completed = false;
    try {
      const cnpj = await resolveCooperativaCnpj(data, currentCoopId, currentUser);
      if (!cnpj) return;

      await flushPendingCooperadoPushes(cnpj);
      await syncOfflineDeliveryImages();
      await flushPendingNotaDeletes(cnpj);

      const cooperadoLogado = currentUser.role === "cooperado";

      if (cooperadoLogado) {
        await syncCooperativaBackground(cnpj, currentCoopId);
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

        const cooperadoNome = getCooperadoNome(latest.cooperados, cooperadoCanonico);

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

        const aguardandoLocal = latest.notasPedido.filter(
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

        const incompletasNaNuvem = latest.notasPedido.filter(
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
      completed = true;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      if (completed) setLastSyncedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !coopId) return;

    const stopIdle = startIdleMonitor();

    const unregister = registerSyncHandler(() => {
      if (document.hidden) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      markUserActivity();
      void runSync({ force: true });
    });

    const initialDelay = setTimeout(() => {
      if (!document.hidden) {
        markUserActivity();
        void runSync({ force: true });
      }
    }, 800);

    const unsubIdle = onAppIdleChange((nowIdle) => {
      if (nowIdle) return;
      if (document.hidden) return;
      void runSync({ force: true });
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markUserActivity();
        void runSync({ force: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const onOnline = () => {
      if (document.hidden) return;
      markUserActivity();
      void runSync({ force: true });
    };
    window.addEventListener("online", onOnline);

    return () => {
      unregister();
      unsubIdle();
      stopIdle();
      clearTimeout(initialDelay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [coopId, user?.id, runSync]);

  const status = useMemo(
    () => ({ syncing, lastSyncedAt }),
    [syncing, lastSyncedAt]
  );

  return (
    <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
  );
}
