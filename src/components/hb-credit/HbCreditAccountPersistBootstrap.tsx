"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";
import { usePathname } from "next/navigation";

/** Cache HB Créditos cooperado após login/sync (abre Minha Conta Coop na hora). */
export function HbCreditAccountPersistBootstrap() {
  const { user } = useAuth();
  const hbOn = useHbCreditEnabled();
  const pathname = usePathname();
  const { syncing, lastSyncedAt, cooperadoPagamentosHydrated } = useSyncStatus();
  const dataRevision = useSyncExternalStore(
    subscribe,
    () => (isAppDataWarm() ? getDataRevision() : -1),
    () => -1
  );
  const lastSyncedRef = useRef<number | null>(null);
  const persistRevisionTimerRef = useRef<number | null>(null);
  const idleCleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!hbOn || !user || user.role !== "cooperado" || !isAppDataWarm()) return;
    if (persistRevisionTimerRef.current) window.clearTimeout(persistRevisionTimerRef.current);
    persistRevisionTimerRef.current = window.setTimeout(() => {
      const cancelIdle = scheduleContaCoopAuxSync(
        () => {
          void persistirHbCreditAccountCooperado(user);
        },
        { idleTimeoutMs: 20_000, fallbackMs: 6_000 }
      );
      idleCleanupRef.current = cancelIdle;
    }, pathname?.includes("minha-conta-coop") ? 800 : 4000);
    return () => {
      if (persistRevisionTimerRef.current) window.clearTimeout(persistRevisionTimerRef.current);
      idleCleanupRef.current?.();
      idleCleanupRef.current = undefined;
    };
  }, [hbOn, user?.id, user?.cooperadoId, user?.cooperativaId, dataRevision, pathname, user]);

  useEffect(() => {
    if (!hbOn || !user || user.role !== "cooperado" || syncing) return;
    if (!cooperadoPagamentosHydrated || lastSyncedAt == null) return;
    if (lastSyncedRef.current === lastSyncedAt) return;
    lastSyncedRef.current = lastSyncedAt;
    const cancelIdle = scheduleContaCoopAuxSync(
      () => {
        void persistirHbCreditAccountCooperado(user);
      },
      { idleTimeoutMs: 15_000, fallbackMs: 5_000 }
    );
    return () => cancelIdle();
  }, [hbOn, user, syncing, lastSyncedAt, cooperadoPagamentosHydrated]);

  return null;
}
