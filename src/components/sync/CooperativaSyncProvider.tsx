"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { resolveCooperativaCnpj, pushNotasPedidoToCloud, flushPendingNotaDeletes } from "@/services/notaPedidoCloudService";
import {
  SYNC_INTERVAL_MS,
  syncCooperativaBidirectional,
} from "@/services/cooperativaSyncCloudService";
import { pushCooperadoToCloud, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, updateData } from "@/services/dataStore";
import { getCooperadoNome } from "@/utils/calculations";
import { isDiretoriaRole } from "@/permissions";
import type { UserRole } from "@/types";

/** Sincronização automática em todas as telas (cooperado e responsável). */
export function CooperativaSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const data = useAppData();
  const syncingRef = useRef(false);
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const runSync = useCallback(async () => {
    if (!user || !data || !coopId || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (!cnpj) return;

      const pushCatalog = isDiretoriaRole(user.role as UserRole);
      const pushMensalidades = isDiretoriaRole(user.role as UserRole);
      await flushPendingNotaDeletes(cnpj);
      await syncCooperativaBidirectional(cnpj, coopId, { pushCatalog, pushMensalidades });

      if (user.role === "cooperado" && user.cooperadoId) {
        const latest = getData();
        const cooperadoCanonico = resolverCooperadoIdCanonico(latest, user.cooperadoId, coopId);
        const registro = latest.cooperados.find((c) => c.id === cooperadoCanonico);
        if (registro) {
          await pushCooperadoToCloud(cnpj, registro, user.email);
        }

        const cooperadoNome = getCooperadoNome(latest.cooperados, cooperadoCanonico);
        const pendentes = latest.notasPedido.filter(
          (n) =>
            n.cooperadoId === cooperadoCanonico &&
            n.status === "aguardando_conferencia" &&
            !n.fotoNaNuvem
        );
        for (const nota of pendentes) {
          const result = await pushNotasPedidoToCloud(cnpj, [nota], cooperadoNome);
          if (result.ok) {
            updateData((d) => ({
              ...d,
              notasPedido: d.notasPedido.map((n) =>
                n.id === nota.id
                  ? { ...n, fotoNaNuvem: true, cooperativaCnpj: normalizeCnpj(cnpj) }
                  : n
              ),
            }));
          }
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [user, data, coopId]);

  useEffect(() => {
    if (!user || !coopId) return;

    void runSync();

    const intervalId = setInterval(() => void runSync(), SYNC_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [coopId, user?.id, runSync]);

  return <>{children}</>;
}
