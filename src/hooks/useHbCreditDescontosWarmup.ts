import { useEffect, useRef } from "react";
import type { User } from "@/types";
import { refreshContaCoopDescontosAfterOperacionalSync } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

const WARMUP_INTERVAL_MS = 25_000;

/** Carrega compras HB da Supabase ao abrir o app e mantém valor a receber alinhado (todos os perfis). */
export function useHbCreditDescontosWarmup(user: Omit<User, "password"> | null) {
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!user || !isContaCoopValorReceberPilot()) return;
    const coopId = getUserCooperativaId(user, getData());
    if (!coopId) return;

    let cancelled = false;

    const run = () => {
      const current = userRef.current;
      if (!current || cancelled || typeof navigator === "undefined" || !navigator.onLine) return;
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

    run();

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(run, WARMUP_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);
}
