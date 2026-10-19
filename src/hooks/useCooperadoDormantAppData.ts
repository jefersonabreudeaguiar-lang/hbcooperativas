"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppData } from "@/types";
import { COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { getData, isAppDataWarm } from "@/services/dataStore";

/**
 * Cooperado PWA — leitura pontual do AppData após materialização (sync / evento).
 * Não assina domínios; `revision` e o evento de snapshot forçam releitura.
 */
export function useCooperadoDormantAppData(active: boolean, revision: number): AppData | null {
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const onRefresh = () => setRefreshTick((n) => n + 1);
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
  }, [active]);

  return useMemo(() => {
    if (!active || !isAppDataWarm()) return null;
    /** `revision` / refresh só forçam releitura pós-sync; não bloqueia pintura com AppData já warm. */
    return getData();
  }, [active, revision, refreshTick]);
}
