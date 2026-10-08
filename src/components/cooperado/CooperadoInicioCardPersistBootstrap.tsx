"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import { isCooperadoInstantResumeEnabled } from "@/lib/performance/cooperadoColdStart";
import { persistirInicioCardCooperadoNotificarPwaLeve } from "@/lib/cooperado/cooperadoPwaLeveUi";
import {
  refreshCooperadoInicioCardFromMotor,
  scheduleCooperadoPwaOperacionalParidadePull,
  shouldRunCooperadoPwaParidadeHooks,
} from "@/lib/cooperado/cooperadoPwaFinanceiroParidadeRefresh";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

/**
 * Mantém cache do card “A receber” após login/sync e quando AppData local muda.
 */
export function CooperadoInicioCardPersistBootstrap() {
  const { user } = useAuth();
  const { syncing, lastSyncedAt, cooperadoPagamentosHydrated } = useSyncStatus();
  const dataRevision = useSyncExternalStore(
    (onStoreChange) =>
      isCooperadoPwaMessengerMode() ? () => {} : subscribe(onStoreChange),
    () =>
      isCooperadoPwaMessengerMode() || !isAppDataWarm() ? -1 : getDataRevision(),
    () => -1
  );
  const lastSyncedRef = useRef<number | null>(null);

  useEffect(() => {
    if (isCooperadoPwaMessengerMode()) return;
    if (!user || user.role !== "cooperado" || !isAppDataWarm()) return;
    persistirInicioCardCooperadoNotificarPwaLeve(user);
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, dataRevision]);

  useEffect(() => {
    if (!user || user.role !== "cooperado" || syncing) return;
    if (!cooperadoPagamentosHydrated || lastSyncedAt == null) return;
    if (lastSyncedRef.current === lastSyncedAt) return;
    lastSyncedRef.current = lastSyncedAt;
    persistirInicioCardCooperadoNotificarPwaLeve(user);
  }, [user, syncing, lastSyncedAt, cooperadoPagamentosHydrated]);

  useEffect(() => {
    if (isCooperadoPwaMessengerMode()) return;
    if (!user || user.role !== "cooperado" || !isCooperadoInstantResumeEnabled()) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden" || !isAppDataWarm()) return;
      persistirInicioCardCooperadoNotificarPwaLeve(user);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [user?.id, user?.cooperadoId, user?.role]);

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !shouldRunCooperadoPwaParidadeHooks()) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refreshCooperadoInicioCardFromMotor(user);
    };

    const onPageShow = (event: PageTransitionEvent) => {
      refreshCooperadoInicioCardFromMotor(user);
      if (event.persisted) {
        scheduleCooperadoPwaOperacionalParidadePull(user, user.cooperativaId, { force: true });
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, user?.role]);

  return null;
}
