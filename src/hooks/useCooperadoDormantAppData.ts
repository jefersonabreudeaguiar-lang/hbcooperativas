"use client";

import { useMemo } from "react";
import type { AppData } from "@/types";
import { getData, isAppDataWarm } from "@/services/dataStore";

/**
 * Cooperado PWA — leitura pontual do AppData após materialização (sync / evento).
 * Não assina domínios; `revision` deve subir só em COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH.
 */
export function useCooperadoDormantAppData(active: boolean, revision: number): AppData | null {
  return useMemo(() => {
    if (!active || revision < 0 || !isAppDataWarm()) return null;
    return getData();
  }, [active, revision]);
}
