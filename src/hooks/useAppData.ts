"use client";

import { useMemo, useRef } from "react";
import { useSyncExternalStore } from "react";
import { getData, getDataRevision, subscribe } from "@/services/dataStore";
import type { AppData } from "@/types";

function getServerSnapshot(): AppData | null {
  return null;
}

function getServerRevision(): number {
  return 0;
}

/** Dados do app — assinatura única via revisão. */
export function useAppData(): AppData | null {
  useSyncExternalStore(subscribe, getDataRevision, getServerRevision);
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
  const revision = useSyncExternalStore(subscribe, getDataRevision, getServerRevision);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  return useMemo(() => {
    const data = getData();
    if (!data) return null;
    return selectorRef.current(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision + deps controlam recálculo
  }, [revision, ...deps]);
}

export function useDataRefresh(): void {
  useSyncExternalStore(subscribe, getDataRevision, getServerRevision);
}
