"use client";

import { useSyncExternalStore } from "react";
import {
  cooperadoContaCoopDescontosSyncFalhou,
  getContaCoopDescontosSyncFailureMessage,
  getContaCoopDescontosSyncHealthRevision,
  subscribeContaCoopDescontosSyncHealth,
} from "@/lib/hb-credit/contaCoopDescontosSyncHealth";

export function useCooperadoHbDescontosSyncFalhou(cooperativaId?: string, cooperadoId?: string): boolean {
  const revision = useSyncExternalStore(
    subscribeContaCoopDescontosSyncHealth,
    getContaCoopDescontosSyncHealthRevision,
    () => 0
  );
  if (!cooperativaId || !cooperadoId) return false;
  void revision;
  return cooperadoContaCoopDescontosSyncFalhou(cooperativaId, cooperadoId);
}

export function useCooperadoHbDescontosSyncFailureMessage(
  cooperativaId?: string,
  cooperadoId?: string
): string | undefined {
  const revision = useSyncExternalStore(
    subscribeContaCoopDescontosSyncHealth,
    getContaCoopDescontosSyncHealthRevision,
    () => 0
  );
  if (!cooperativaId || !cooperadoId) return undefined;
  void revision;
  return getContaCoopDescontosSyncFailureMessage(cooperativaId, cooperadoId);
}
