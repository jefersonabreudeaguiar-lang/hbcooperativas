"use client";

import { useCallback, useMemo, useRef } from "react";
import { useSyncExternalStore } from "react";
import {
  getAppDataDomainRevision,
  subscribeAppDataDomain,
  type AppDataNotifyDomain,
} from "@/lib/performance/appDataDomainNotify";
import { getData, getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import type { AppData } from "@/types";

const DOMAIN_ORDER: AppDataNotifyDomain[] = ["shell", "notas", "financeiro", "operacional"];

function normalizeDomains(domains: readonly AppDataNotifyDomain[]): AppDataNotifyDomain[] {
  const set = new Set(domains);
  return DOMAIN_ORDER.filter((d) => set.has(d));
}

function getDomainsRevisionSnapshot(domains: readonly AppDataNotifyDomain[]): string {
  if (!isAppDataWarm()) return "";
  return normalizeDomains(domains)
    .map((d) => getAppDataDomainRevision(d))
    .join(",");
}

function subscribeAppDataDomains(
  domains: readonly AppDataNotifyDomain[],
  onStoreChange: () => void
): () => void {
  const active = normalizeDomains(domains);
  if (!active.length) {
    return subscribe(onStoreChange);
  }
  const unsubs = active.map((d) => subscribeAppDataDomain(d, onStoreChange));
  return () => {
    for (const u of unsubs) u();
  };
}

/** Re-render só quando algum domínio listado mudar (HX 8.3 / U3). */
export function useAppDataSnapshotForDomains(
  domains: readonly AppDataNotifyDomain[]
): AppData | null {
  const domainKey = normalizeDomains(domains).join("|");
  const subscribeDomains = useCallback(
    (onStoreChange: () => void) => subscribeAppDataDomains(domains, onStoreChange),
    [domainKey]
  );
  useSyncExternalStore(
    subscribeDomains,
    () => getDomainsRevisionSnapshot(domains),
    () => ""
  );
  if (!isAppDataWarm()) return null;
  return getData();
}

function getServerSnapshot(): AppData | null {
  return null;
}

function getServerRevision(): number {
  return 0;
}

function getWarmRevision(): number {
  return isAppDataWarm() ? getDataRevision() : -1;
}

/** Dados do app — null até localStorage carregar (evita flash de totais zerados). */
export function useAppData(): AppData | null {
  useSyncExternalStore(subscribe, getWarmRevision, getServerRevision);
  if (!isAppDataWarm()) return null;
  return getData();
}

/**
 * Lê só o pedaço necessário — evita re-render da tela inteira a cada sync.
 * Passe dependências estáveis (ids, mes) no segundo argumento.
 */
export function useAppDataSelector<T>(
  selector: (data: AppData) => T,
  deps: readonly unknown[] = []
): T | null {
  const revision = useSyncExternalStore(subscribe, getWarmRevision, getServerRevision);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  return useMemo(() => {
    if (!isAppDataWarm()) return null;
    const data = getData();
    return selectorRef.current(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision + deps controlam recálculo
  }, [revision, ...deps]);
}

/** Keep-alive mobile: painel inativo não re-renderiza a cada sync. */
export function useAppDataSelectorForDomainsWhenActive<T>(
  panelActive: boolean,
  domains: readonly AppDataNotifyDomain[],
  selector: (data: AppData) => T,
  deps: readonly unknown[] = []
): T | null {
  const domainKey = normalizeDomains(domains).join("|");
  const subscribeDomains = useCallback(
    (onStoreChange: () => void) => {
      if (!panelActive) return () => undefined;
      return subscribeAppDataDomains(domains, onStoreChange);
    },
    [panelActive, domainKey]
  );
  const domainRevision = useSyncExternalStore(
    subscribeDomains,
    () => (panelActive ? getDomainsRevisionSnapshot(domains) : `paused:${domainKey}`),
    () => ""
  );
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  return useMemo(() => {
    if (!isAppDataWarm()) return null;
    return selectorRef.current(getData());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- domainRevision + deps
  }, [domainRevision, ...deps]);
}

export function useAppDataSelectorForDomains<T>(
  domains: readonly AppDataNotifyDomain[],
  selector: (data: AppData) => T,
  deps: readonly unknown[] = []
): T | null {
  const domainKey = normalizeDomains(domains).join("|");
  const subscribeDomains = useCallback(
    (onStoreChange: () => void) => subscribeAppDataDomains(domains, onStoreChange),
    [domainKey]
  );
  const domainRevision = useSyncExternalStore(
    subscribeDomains,
    () => getDomainsRevisionSnapshot(domains),
    () => ""
  );
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  return useMemo(() => {
    if (!isAppDataWarm()) return null;
    return selectorRef.current(getData());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- domainRevision + deps
  }, [domainRevision, ...deps]);
}

export function useDataRefresh(): void {
  useSyncExternalStore(subscribe, getWarmRevision, getServerRevision);
}

/** Indica se os dados locais já foram carregados do disco. */
export function useAppDataReady(): boolean {
  useSyncExternalStore(subscribe, getWarmRevision, getServerRevision);
  return isAppDataWarm();
}
