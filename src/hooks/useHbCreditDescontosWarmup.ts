import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@/types";
import { refreshContaCoopDescontosAfterOperacionalSync } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { HB_CREDIT_ACCOUNT_LOADED_EVENT } from "@/lib/hb-credit/hbCreditEntryEvents";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";

const WARMUP_INTERVAL_MS = 60_000;
const HB_PAGE_PREFIX = "/minha-conta-coop";

/** Carrega compras HB da Supabase ao abrir o app e mantém valor a receber alinhado (todos os perfis). */
export function useHbCreditDescontosWarmup(user: Omit<User, "password"> | null) {
  const pathname = usePathname();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!user || !isContaCoopValorReceberPilot()) return;
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

    const staffDelay = user.role === "cooperado" ? 10_000 : 15_000;
    const initialTimer = window.setTimeout(run, staffDelay);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(run, WARMUP_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener(HB_CREDIT_ACCOUNT_LOADED_EVENT, onAccountLoaded);
      window.clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      for (const cleanup of idleCleanups) cleanup();
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId, pathname]);
}
