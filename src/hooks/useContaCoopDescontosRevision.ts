"use client";

import { useCallback } from "react";
import { useSyncExternalStore } from "react";
import {
  getContaCoopDescontosRevision,
  subscribeContaCoopDescontos,
} from "@/lib/hb-credit/contaCoopDescontosNotify";

/** Re-render quando compras/estornos HB atualizam cache de sessão (Início, resumo, ficha). */
export function useContaCoopDescontosRevision(): number {
  return useContaCoopDescontosRevisionWhenLive(true);
}

/** PWA Início/Financeiro adormecido — não assina HB até voltar ao modo live. */
export function useContaCoopDescontosRevisionWhenLive(live: boolean): number {
  const subscribe = useCallback(
    (onChange: () => void) => (live ? subscribeContaCoopDescontos(onChange) : () => undefined),
    [live]
  );
  const getSnapshot = useCallback(() => (live ? getContaCoopDescontosRevision() : 0), [live]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
