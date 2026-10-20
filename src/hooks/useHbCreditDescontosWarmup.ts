import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@/types";
import {
  puxarDebitoHbFichaDescontosSilentCooperado,
  refreshContaCoopDescontosAfterOperacionalSync,
} from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { HB_CREDIT_ACCOUNT_LOADED_EVENT } from "@/lib/hb-credit/hbCreditEntryEvents";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { shouldSyncHbFichaBaseDescontos } from "@/lib/hb-credit/hbFichaBaseOperacional";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";
import { isStaffHbCoopWideSyncRoute } from "@/lib/hb-credit/staffHbSyncRoute";
import { isStaffConferenciaModalOpen } from "@/lib/performance/staffConferenciaSyncTier";
import {
  isCooperadoManualOperacionalSync,
  scheduleCooperadoPostInteractiveTask,
  scheduleStaffPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";

const WARMUP_INITIAL_DELAY_COOPERADO_MS = 3_000;
const WARMUP_INITIAL_DELAY_STAFF_MS = 15_000;
const SILENT_FICHA_VISIBLE_GAP_MS = 90_000;
const HB_PAGE_PREFIX = "/minha-conta-coop";
let lastSilentFichaAt = 0;

/** Carrega compras HB da Supabase ao abrir o app e mantém valor a receber alinhado (todos os perfis). */
export function useHbCreditDescontosWarmup(user: Omit<User, "password"> | null) {
  const pathname = usePathname();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!user || user.role !== "cooperado") return;
    if (!isCooperadoManualOperacionalSync()) return;
    if (!shouldSyncHbFichaBaseDescontos()) return;

    let cancelled = false;
    const idleCleanups: Array<() => void> = [];

    const runCore = () => {
      const current = userRef.current;
      if (
        !current ||
        cancelled ||
        current.role !== "cooperado" ||
        typeof navigator === "undefined" ||
        !navigator.onLine ||
        document.visibilityState !== "visible" ||
        !isAppDataWarm()
      ) {
        return;
      }
      if (Date.now() - lastSilentFichaAt < SILENT_FICHA_VISIBLE_GAP_MS) return;
      const cid = getUserCooperativaId(current, getData());
      if (!cid || !current.cooperadoId) return;
      void resolveCooperativaCnpj(getData(), cid, current).then((cnpj) => {
        if (cancelled || !cnpj) return;
        lastSilentFichaAt = Date.now();
        void puxarDebitoHbFichaDescontosSilentCooperado({
          cnpj,
          cooperativaId: cid,
          user: current,
        });
      });
    };

    const run = () => {
      idleCleanups.push(
        scheduleContaCoopAuxSync(runCore, { idleTimeoutMs: 16_000, fallbackMs: 5_000 })
      );
    };

    scheduleCooperadoPostInteractiveTask(run);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        idleCleanups.push(
          scheduleContaCoopAuxSync(runCore, { idleTimeoutMs: 16_000, fallbackMs: 8_000 })
        );
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      for (const cleanup of idleCleanups) cleanup();
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);

  useEffect(() => {
    if (!user || !shouldSyncHbFichaBaseDescontos()) return;
    if (user.role === "cooperado" && isCooperadoManualOperacionalSync()) return;
    const coopId = getUserCooperativaId(user, getData());
    if (!coopId) return;

    let cancelled = false;
    const idleCleanups: Array<() => void> = [];
    let hbAccountGatePending = pathname === HB_PAGE_PREFIX || pathname.startsWith(`${HB_PAGE_PREFIX}/`);

    const runCore = () => {
      const current = userRef.current;
      if (
        !current ||
        cancelled ||
        typeof navigator === "undefined" ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      if (hbAccountGatePending) return;
      if (isStaffConferenciaModalOpen()) return;
      const staffRole =
        current.role === "responsavel" || current.role === "tesoureiro" || current.role === "admin";
      if (staffRole && !isStaffHbCoopWideSyncRoute(pathname)) return;
      if (
        pathname.startsWith("/conta-coop") &&
        staffRole
      ) {
        return;
      }
      const cid = getUserCooperativaId(current, getData());
      if (!cid) return;
      void resolveCooperativaCnpj(getData(), cid, current).then((cnpj) => {
        if (cancelled || !cnpj) return;
        void refreshContaCoopDescontosAfterOperacionalSync({
          cnpj,
          cooperativaId: cid,
          user: current,
        });
      });
    };

    const run = () => {
      const cancelIdle = scheduleContaCoopAuxSync(runCore, { idleTimeoutMs: 16_000, fallbackMs: 5_000 });
      idleCleanups.push(cancelIdle);
    };

    const releaseHbAccountGate = () => {
      hbAccountGatePending = false;
      run();
    };

    const onAccountLoaded = () => releaseHbAccountGate();
    if (hbAccountGatePending) {
      window.addEventListener(HB_CREDIT_ACCOUNT_LOADED_EVENT, onAccountLoaded, { once: true });
    }

    const staffDelay = user.role === "cooperado" ? WARMUP_INITIAL_DELAY_COOPERADO_MS : WARMUP_INITIAL_DELAY_STAFF_MS;
    const initialTimer = window.setTimeout(() => {
      if (user.role === "cooperado") run();
      else scheduleStaffPostInteractiveTask(run);
    }, staffDelay);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(HB_CREDIT_ACCOUNT_LOADED_EVENT, onAccountLoaded);
      window.clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", onVisible);
      for (const cleanup of idleCleanups) cleanup();
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId, pathname]);
}
