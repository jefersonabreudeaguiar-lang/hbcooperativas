"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  resolveCooperativaCnpj,
  pushNotasPedidoToCloud,
  pushNotaComFotosEmStreaming,
  flushPendingNotaDeletes,
  fetchNotaPedidoFromCloud,
  finalizeNotaEntregaNaNuvem,
  syncOfflineDeliveryImages,
} from "@/services/notaPedidoCloudService";
import {
  getSyncIntervalMs,
  getSyncMinGapMs,
  isMobileDevice,
  syncCooperativaBackground,
  syncCooperativaBidirectional,
} from "@/services/cooperativaSyncCloudService";
import { pushCooperadoToCloud, resolverCooperadoIdCanonico, flushPendingCooperadoPushes } from "@/services/cooperadoCloudService";
import { registerSyncHandler } from "@/services/syncRequest";
import { getData, updateDataSafe } from "@/services/dataStore";
import { getCooperadoNome } from "@/utils/calculations";
import { compactarFotosNoArmazenamento, contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { isDiretoriaRole } from "@/permissions";
import type { UserRole } from "@/types";

const COOPERADO_PUSH_GAP_MS = 3 * 60 * 1000;

/** Sincronização automática — leve no celular do cooperado. */
export function CooperativaSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const syncingRef = useRef(false);
  const lastSyncAtRef = useRef(0);
  const lastCooperadoPushRef = useRef(0);
  const userRef = useRef(user);
  userRef.current = user;

  const coopId =
    user && typeof window !== "undefined"
      ? getUserCooperativaId(user, getData())
      : user?.cooperativaId;

  const runSync = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || syncingRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const data = getData();
    const currentCoopId = getUserCooperativaId(currentUser, data);
    if (!currentCoopId) return;

    const now = Date.now();
    if (now - lastSyncAtRef.current < getSyncMinGapMs()) return;
    lastSyncAtRef.current = now;

    syncingRef.current = true;
    try {
      const cnpj = await resolveCooperativaCnpj(data, currentCoopId, currentUser);
      if (!cnpj) return;

      await flushPendingCooperadoPushes(cnpj);
      await syncOfflineDeliveryImages();
      await flushPendingNotaDeletes(cnpj);

      const cooperadoNoCelular = currentUser.role === "cooperado" && isMobileDevice();

      if (cooperadoNoCelular) {
        await syncCooperativaBackground(cnpj, currentCoopId);
      } else {
        const pushCatalog = isDiretoriaRole(currentUser.role as UserRole);
        const pushMensalidades = isDiretoriaRole(currentUser.role as UserRole);
        await syncCooperativaBidirectional(cnpj, currentCoopId, { pushCatalog, pushMensalidades });
      }

      if (currentUser.role === "cooperado" && currentUser.cooperadoId) {
        const latest = getData();
        const cooperadoCanonico = resolverCooperadoIdCanonico(latest, currentUser.cooperadoId, currentCoopId);
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
          const fotos = nota.fotosPedido ?? (nota.fotoPedido ? [nota.fotoPedido] : []);
          if (fotos.length === 0) continue;
          const result =
            fotos.length > 1
              ? await pushNotaComFotosEmStreaming(
                  cnpj,
                  nota,
                  (i) => Promise.resolve(fotos[i]),
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

          const fotos = nota.fotosPedido ?? (nota.fotoPedido ? [nota.fotoPedido] : []);
          if (fotos.length === 0) continue;
          await pushNotaComFotosEmStreaming(
            cnpj,
            nota,
            (i) => Promise.resolve(fotos[i]),
            esperado,
            cooperadoNome
          );
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user?.id || !coopId) return;

    const unregister = registerSyncHandler(() => {
      if (document.hidden) return;
      void runSync();
    });

    const startSync = () => {
      if (document.hidden) return;
      void runSync();
    };

    const initialDelay = setTimeout(startSync, 800);

    const intervalId = setInterval(startSync, getSyncIntervalMs());

    const onVisible = () => {
      if (document.visibilityState === "visible") startSync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unregister();
      clearTimeout(initialDelay);
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [coopId, user?.id, runSync]);

  return <>{children}</>;
}
