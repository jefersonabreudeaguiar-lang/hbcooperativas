"use client";

import { useEffect, useRef } from "react";
import {
  cloudRevisionChangedSinceApplied,
  grantCooperadoEventDrivenSync,
  isCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { markNextCooperadoSyncSilent } from "@/lib/performance/cooperadoColdStart";
import { requestCooperadoStaffRevisionSync } from "@/services/syncRequest";
import { fetchCooperativaCloudRevision } from "@/services/cooperativaSyncRevisionService";

/** Consulta leve na nuvem — não baixa ficha/notas. */
const REVISION_POLL_MS = 120_000;
const MIN_GAP_BETWEEN_CHECKS_MS = 45_000;

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
  const syncingRef = useRef(syncing);
  syncingRef.current = syncing;

  useEffect(() => {
    if (!enabled || !isCooperadoEventDrivenSync()) return;
    const digits = (cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14) return;

    let cancelled = false;
    let intervalId = 0;

    const check = async () => {
      if (cancelled || syncingRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      if (now - lastCheckAtRef.current < MIN_GAP_BETWEEN_CHECKS_MS) return;
      lastCheckAtRef.current = now;

      const remote = await fetchCooperativaCloudRevision(digits);
      if (cancelled || !remote || syncingRef.current) return;
      if (!cloudRevisionChangedSinceApplied(digits, remote)) return;

      grantCooperadoEventDrivenSync();
      markNextCooperadoSyncSilent();
      requestCooperadoStaffRevisionSync();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    intervalId = window.setInterval(() => void check(), REVISION_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [cnpj, enabled, syncing]);
}
