"use client";

import { useSyncExternalStore } from "react";
import {
  getContaCoopDescontosRevision,
  subscribeContaCoopDescontos,
} from "@/lib/hb-credit/contaCoopDescontosNotify";

/** Re-render quando compras/estornos HB atualizam cache de sessão (Início, resumo, ficha). */
export function useContaCoopDescontosRevision(): number {
  return useSyncExternalStore(subscribeContaCoopDescontos, getContaCoopDescontosRevision, () => 0);
}
