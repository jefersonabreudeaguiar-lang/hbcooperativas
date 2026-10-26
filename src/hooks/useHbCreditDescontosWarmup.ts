import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@/types";
import {
  puxarDebitoHbFichaDescontosSilentCooperado,
  refreshContaCoopDescontosAfterOperacionalSync,
} from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { HB_CREDIT_ACCOUNT_LOADED_EVENT } from "@/lib/hb-credit/hbCreditEntryEvents";
import { HB_CREDIT_ACCOUNT_CACHE_EVENT } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { cooperadoHbCreditCacheTemValor } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { lerCnpjHbCreditPersistidoParaCooperado } from "@/lib/hb-credit/hbCreditAccountPersistencia";
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
import { staffGestaoPerfilEhDesktop } from "@/lib/staff/staffGestaoPerfilDesktop";

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
        document.visibilityState !== "visible"
      ) {
        return;
      }
      if (Date.now() - lastSilentFichaAt < SILENT_FICHA_VISIBLE_GAP_MS) return;
      const data = isAppDataWarm() ? getData() : null;
      const cid = (data ? getUserCooperativaId(current, data) : null) ?? current.cooperativaId;
      if (!cid || !current.cooperadoId) return;
      const fromAccount = lerCnpjHbCreditPersistidoParaCooperado(current.cooperadoId);
      const cnpjHint =
        (current.cooperativaCnpj ?? "").replace(/\D/g, "").length === 14
          ? current.cooperativaCnpj!.replace(/\D/g, "")
          : fromAccount;
      const apply = (cnpj: string) => {
        if (cancelled || !cnpj) return;
        void puxarDebitoHbFichaDescontosSilentCooperado({
          cnpj,
          cooperativaId: cid,
          user: current,
        }).then((ok) => {
          if (ok) lastSilentFichaAt = Date.now();
        });
      };
      if (cnpjHint) {
        apply(cnpjHint);
        return;
      }
      if (!data) return;
      void resolveCooperativaCnpj(data, cid, current).then((cnpj) => apply(cnpj ?? ""));
    };

    const runRapido = () => {
      idleCleanups.push(
        scheduleContaCoopAuxSync(runCore, { idleTimeoutMs: 800, fallbackMs: 200 })
      );
    };
    const runIdle = () => {
      idleCleanups.push(
        scheduleContaCoopAuxSync(runCore, { idleTimeoutMs: 16_000, fallbackMs: 5_000 })
      );
    };

    if (cooperadoHbCreditCacheTemValor(user)) runRapido();
    else scheduleCooperadoPostInteractiveTask(runIdle);

    const onAccountCache = () => runRapido();
    window.addEventListener(HB_CREDIT_ACCOUNT_CACHE_EVENT, onAccountCache);

    const onVisible = () => {
      if (document.visibilityState === "visible") runRapido();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(HB_CREDIT_ACCOUNT_CACHE_EVENT, onAccountCache);
      document.removeEventListener("visibilitychange", onVisible);
      for (const cleanup of idleCleanups) cleanup();
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);

  useEffect(() => {
    if (!user || !shouldSyncHbFichaBaseDescontos()) return;
    if (user.role !== "cooperado" && staffGestaoPerfilEhDesktop()) return;
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
