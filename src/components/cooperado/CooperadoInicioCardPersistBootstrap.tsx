"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";

/**
 * Mantém cache do card “A receber” após login/sync e quando AppData local muda.
 */
export function CooperadoInicioCardPersistBootstrap() {
  const { user } = useAuth();
  const { syncing, lastSyncedAt, cooperadoPagamentosHydrated } = useSyncStatus();
  const dataRevision = useSyncExternalStore(
    subscribe,
    () => (isAppDataWarm() ? getDataRevision() : -1),
    () => -1
  );
  const lastSyncedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isAppDataWarm()) return;
    persistirInicioCardValorReceberCooperado(user);
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, dataRevision]);

  useEffect(() => {
    if (!user || user.role !== "cooperado" || syncing) return;
    if (!cooperadoPagamentosHydrated || lastSyncedAt == null) return;
    if (lastSyncedRef.current === lastSyncedAt) return;
    lastSyncedRef.current = lastSyncedAt;
    persistirInicioCardValorReceberCooperado(user);
  }, [user, syncing, lastSyncedAt, cooperadoPagamentosHydrated]);

  return null;
}
