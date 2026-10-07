"use client";

import { useCallback } from "react";
import { useSyncExternalStore } from "react";
import {
  getAppDataDomainRevision,
  subscribeAppDataDomain,
  type AppDataNotifyDomain,
} from "@/lib/performance/appDataDomainNotify";
import { getData, isAppDataWarm } from "@/services/dataStore";
import type { AppData } from "@/types";

const DOMAIN_ORDER: AppDataNotifyDomain[] = ["shell", "notas", "financeiro", "operacional"];

function normalizeDomains(domains: readonly AppDataNotifyDomain[]): AppDataNotifyDomain[] {
  const set = new Set(domains);
  return DOMAIN_ORDER.filter((d) => set.has(d));
}

function revisionSnapshot(domains: readonly AppDataNotifyDomain[]): string {
  if (!isAppDataWarm()) return "";
  return normalizeDomains(domains)
    .map((d) => getAppDataDomainRevision(d))
    .join(",");
}

/**
 * Keep-alive mobile cooperado: painel em segundo plano não re-renderiza a cada sync.
 * Ao voltar na aba, assina de novo e reconcilia na próxima revisão dos domínios.
 */
export function useCooperadoPanelAppData(
  panelActive: boolean,
  domains: readonly AppDataNotifyDomain[]
): AppData | null {
  const domainKey = normalizeDomains(domains).join("|");
  const subscribeDomains = useCallback(
    (onStoreChange: () => void) => {
      if (!panelActive) return () => undefined;
      const active = normalizeDomains(domains);
      const unsubs = active.map((d) => subscribeAppDataDomain(d, onStoreChange));
      return () => {
        for (const u of unsubs) u();
      };
    },
    [panelActive, domainKey]
  );

  useSyncExternalStore(
    subscribeDomains,
    () => (panelActive ? revisionSnapshot(domains) : `paused:${domainKey}`),
    () => ""
  );

  if (!isAppDataWarm()) return null;
  return getData();
}

/** Mesmo contrato do cooperado — gestão mobile keep-alive (U4). */
export const useStaffPanelAppData = useCooperadoPanelAppData;
