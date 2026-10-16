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
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { isCooperadoManualOperacionalSync } from "@/lib/performance/cooperadoColdStart";
import {
  lerHbCreditAccountPersistido,
  lerHbCreditAccountPersistidoFlex,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { scheduleCooperadoFinanceiroDisplayWarmup } from "@/lib/cooperado/cooperadoFinanceiroDisplayWarmup";
import {
  scheduleCooperadoHbCreditLimiteAndAccountWarmup,
  scheduleCooperadoPilotHbCreditAccountPersist,
} from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";

/** Cache HB Créditos cooperado após login/sync (abre Minha Conta Coop na hora). */
export function HbCreditAccountPersistBootstrap() {
  const { user } = useAuth();
  const hbCredit = useHbCreditEnabled(user);
  const hbNavOn = hbCredit.navEnabled;
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
    if (!hbNavOn || !user || user.role !== "cooperado" || !isAppDataWarm()) {
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
  }, [hbNavOn, user?.id, user?.cooperativaId, dataRevision, user]);

  const hbApiCooperadoId =
    user?.role === "cooperado" ? resolveHbCreditApiCooperadoId(user, user.cooperadoId) : "";

  const persist = () => {
    if (user?.role === "cooperado") {
      void persistirHbCreditAccountCooperado(user).then((ok) => {
        if (ok) notifyHbCreditAccountCacheUpdated();
      });
    }
  };

  useEffect(() => {
    if (!hbNavOn || !user || user.role !== "cooperado") return;
    scheduleCooperadoPilotHbCreditAccountPersist(user);
  }, [hbNavOn, user?.id, user?.role]);

  useEffect(() => {
    if (!hbNavOn || user?.role !== "cooperado" || dataRevision < 0) return;
    if (persistRevisionTimerRef.current) {
      window.clearTimeout(persistRevisionTimerRef.current);
    }
    persistRevisionTimerRef.current = window.setTimeout(() => {
      persistRevisionTimerRef.current = null;
      scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
    }, 900);
    return () => {
      if (persistRevisionTimerRef.current) {
        window.clearTimeout(persistRevisionTimerRef.current);
        persistRevisionTimerRef.current = null;
      }
    };
  }, [hbNavOn, user, dataRevision]);

  useEffect(() => {
    if (!hbNavOn || !user || user.role !== "cooperado" || syncing) return;
    if (!cooperadoPagamentosHydrated || lastSyncedAt == null) return;
    if (lastSyncedRef.current === lastSyncedAt) return;
    lastSyncedRef.current = lastSyncedAt;
    const cancelIdle = scheduleContaCoopAuxSync(
      () => {
        scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
        scheduleCooperadoFinanceiroDisplayWarmup(user);
        persist();
      },
      { idleTimeoutMs: 15_000, fallbackMs: 5_000 }
    );
    return () => cancelIdle();
  }, [hbNavOn, user, syncing, lastSyncedAt, cooperadoPagamentosHydrated]);

  const cooperadoSyncManual = isCooperadoManualOperacionalSync();

  useEffect(() => {
    if (!hbNavOn || user?.role !== "cooperado" || !cooperadoSyncManual) return;
    if (!coopCnpj || !hbApiCooperadoId) return;
    const cached =
      lerHbCreditAccountPersistido(coopCnpj, hbApiCooperadoId) ??
      lerHbCreditAccountPersistidoFlex(hbApiCooperadoId, coopCnpj);
    const acc = cached?.account;
    if (
      acc &&
      ((acc.limiteLiberadoCents ?? 0) > 0 || (acc.valorDisponivelCents ?? 0) > 0 || (acc.valorUsadoCents ?? 0) > 0)
    ) {
      return;
    }
    const cancelIdle = scheduleContaCoopAuxSync(persist, { idleTimeoutMs: 10_000, fallbackMs: 3_000 });
    return () => cancelIdle();
  }, [hbNavOn, user?.id, user?.role, cooperadoSyncManual, coopCnpj, hbApiCooperadoId]);

  useEffect(() => {
    if (!hbNavOn || user?.role !== "cooperado" || cooperadoSyncManual) return;
    const onLimiteSynced = () => persist();
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
    return () => window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
  }, [hbNavOn, user?.id, user?.role, cooperadoSyncManual]);

  useEffect(() => {
    if (!hbNavOn || user?.role !== "cooperado" || cooperadoSyncManual) return;
    const onOnline = () => persist();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [hbNavOn, user?.id, user?.role, cooperadoSyncManual]);

  useHbCreditAccountRevisionPoll({
    cnpj: coopCnpj,
    cooperadoId: hbApiCooperadoId,
    enabled:
      hbNavOn &&
      user?.role === "cooperado" &&
      Boolean(coopCnpj && hbApiCooperadoId) &&
      !pathname?.includes("minha-conta-coop"),
    onRevisionChange: persist,
  });

  return null;
}
