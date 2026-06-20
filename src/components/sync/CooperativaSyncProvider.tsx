"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  SYNC_INTERVAL_MS,
  syncCooperativaBidirectional,
} from "@/services/cooperativaSyncCloudService";

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
      if (cnpj) await syncCooperativaBidirectional(cnpj, coopId);
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
