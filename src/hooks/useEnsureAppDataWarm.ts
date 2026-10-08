"use client";

import { useLayoutEffect } from "react";
import {
  ensureAppDataEagerWarm,
  isCooperadoInstantResumeEnabled,
  scheduleCooperadoPaintFirst,
} from "@/lib/performance/cooperadoColdStart";
import { useAppDataReady } from "@/hooks/useAppData";

/** 1º frame: lê localStorage de forma síncrona (última sessão na tela). */
export function useEnsureAppDataWarm(): boolean {
  useLayoutEffect(() => {
    if (isCooperadoInstantResumeEnabled()) {
      scheduleCooperadoPaintFirst(ensureAppDataEagerWarm);
      return;
    }
    ensureAppDataEagerWarm();
  }, []);
  return useAppDataReady();
}
