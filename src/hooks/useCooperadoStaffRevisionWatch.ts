"use client";

import { useEffect, useRef } from "react";
import { isCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";

/** Consulta leve na nuvem enquanto o app está em uso. */
const REVISION_POLL_MS = 2 * 60_000;
const MIN_GAP_BETWEEN_CHECKS_MS = 20_000;
const MIN_GAP_FOREGROUND_MS = 8_000;

type Opts = {
  cnpj: string | null | undefined;
  enabled: boolean;
  syncing: boolean;
};

/**
 * Cooperado event-driven: detecta lançamentos do responsável (operacional/notas)
 * e dispara uma sync — sem polling agressivo nem sync em idle/online genérico.
 */
export function useCooperadoStaffRevisionWatch({ cnpj, enabled, syncing }: Opts) {
  const lastCheckAtRef = useRef(0);
  const lastForegroundAtRef = useRef(0);
  const syncingRef = useRef(syncing);
  syncingRef.current = syncing;

  useEffect(() => {
    if (!enabled || !isCooperadoEventDrivenSync()) return;
    const digits = (cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14) return;

    let cancelled = false;
    let intervalId = 0;

    const check = async (foreground: boolean) => {
      if (cancelled || syncingRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      const minGap = foreground ? MIN_GAP_FOREGROUND_MS : MIN_GAP_BETWEEN_CHECKS_MS;
      if (now - lastCheckAtRef.current < minGap) return;
      if (foreground && now - lastForegroundAtRef.current < MIN_GAP_FOREGROUND_MS) return;
      lastCheckAtRef.current = now;
      if (foreground) lastForegroundAtRef.current = now;

      await runCooperadoForegroundOperacionalCheck(digits);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };

    void check(true);
    intervalId = window.setInterval(() => void check(false), REVISION_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [cnpj, enabled, syncing]);
}
