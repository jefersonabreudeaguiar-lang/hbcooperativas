"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { getData, getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";
import { HB_CREDIT_LIMITE_SYNCED_EVENT } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { usePathname } from "next/navigation";
import { useHbCreditAccountRevisionPoll } from "@/hooks/useHbCreditAccountRevisionPoll";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

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
  const [coopCnpj, setCoopCnpj] = useState("");
  const lastSyncedRef = useRef<number | null>(null);
  const persistRevisionTimerRef = useRef<number | null>(null);
  const idleCleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!hbOn || !user || user.role !== "cooperado" || !isAppDataWarm()) {
      setCoopCnpj("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const data = getData();
      const coopId = getUserCooperativaId(user, data);
      if (!coopId) return;
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (!cancelled && cnpj) setCoopCnpj(cnpj);
    })();
    return () => {
      cancelled = true;
    };
  }, [hbOn, user?.id, user?.cooperativaId, dataRevision, user]);

  const persist = () => {
    if (user?.role === "cooperado") void persistirHbCreditAccountCooperado(user);
  };

  useEffect(() => {
    if (!hbOn || !user || user.role !== "cooperado" || !isAppDataWarm()) return;
    if (persistRevisionTimerRef.current) window.clearTimeout(persistRevisionTimerRef.current);
    persistRevisionTimerRef.current = window.setTimeout(() => {
      const cancelIdle = scheduleContaCoopAuxSync(persist, { idleTimeoutMs: 20_000, fallbackMs: 6_000 });
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
    const cancelIdle = scheduleContaCoopAuxSync(persist, { idleTimeoutMs: 15_000, fallbackMs: 5_000 });
    return () => cancelIdle();
  }, [hbOn, user, syncing, lastSyncedAt, cooperadoPagamentosHydrated]);

  useEffect(() => {
    if (!hbOn || user?.role !== "cooperado") return;
    const onLimiteSynced = () => persist();
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
    return () => window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
  }, [hbOn, user?.id, user?.role]);

  useHbCreditAccountRevisionPoll({
    cnpj: coopCnpj,
    cooperadoId: user?.cooperadoId ?? "",
    enabled:
      hbOn &&
      user?.role === "cooperado" &&
      Boolean(coopCnpj && user.cooperadoId) &&
      !pathname?.includes("minha-conta-coop"),
    onRevisionChange: persist,
  });

  return null;
}
