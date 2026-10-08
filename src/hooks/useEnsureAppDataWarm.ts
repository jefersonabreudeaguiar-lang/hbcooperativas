"use client";

import { useLayoutEffect } from "react";
import { ensureAppDataEagerWarm } from "@/lib/performance/cooperadoColdStart";
import { useAppDataReady } from "@/hooks/useAppData";

/** 1º frame: lê localStorage de forma síncrona (última sessão na tela). */
export function useEnsureAppDataWarm(): boolean {
  useLayoutEffect(() => {
    ensureAppDataEagerWarm();
  }, []);
  return useAppDataReady();
}
