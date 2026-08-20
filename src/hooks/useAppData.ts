"use client";

import { useMemo, useRef } from "react";
import { useSyncExternalStore } from "react";
import { getData, getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import type { AppData } from "@/types";

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

export function useDataRefresh(): void {
  useSyncExternalStore(subscribe, getWarmRevision, getServerRevision);
}

/** Indica se os dados locais já foram carregados do disco. */
export function useAppDataReady(): boolean {
  useSyncExternalStore(subscribe, getWarmRevision, getServerRevision);
  return isAppDataWarm();
}
