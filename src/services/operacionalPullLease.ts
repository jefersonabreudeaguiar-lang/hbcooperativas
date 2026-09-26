import type { AppData } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { saveDataSafe } from "@/services/dataStore";

const generations = new Map<string, number>();

/** Lease vigente durante `runSync` cooperado — somente leitura para filhos (H8.15F). */
let boundCooperadoRunSyncSession: CooperativaSyncSessionLease | null = null;

export type OperacionalPullLease = {
  cnpj: string;
  generation: number;
  isCurrent: () => boolean;
};

/** Mesmo contador Map — lease de sessão do job de sync (H8.15C/D). */
export type CooperativaSyncSessionLease = OperacionalPullLease;

function bumpGeneration(cnpj: string): CooperativaSyncSessionLease {
  const key = normalizeCnpj(cnpj);
  if (key.length !== 14) {
    throw new Error("OPERACIONAL_PULL_LEASE_CNPJ_INVALIDO");
  }

  const generation = (generations.get(key) ?? 0) + 1;
  generations.set(key, generation);

  return {
    cnpj: key,
    generation,
    isCurrent: () => generations.get(key) === generation,
  };
}

/** Pull operacional standalone (hydrate, telas) — incrementa generation. */
export function acquireOperacionalPullLease(cnpj: string): OperacionalPullLease {
  return bumpGeneration(cnpj);
}

/** Início de job syncCooperativaBackground / runSync cooperado — incrementa generation. */
export function acquireCooperativaSyncSessionLease(cnpj: string): CooperativaSyncSessionLease {
  return bumpGeneration(cnpj);
}

export function getOperacionalPullGeneration(cnpj: string): number {
  return getCooperativaSyncSessionGeneration(cnpj);
}

export function getCooperativaSyncSessionGeneration(cnpj: string): number {
  const key = normalizeCnpj(cnpj);
  if (key.length !== 14) return 0;
  return generations.get(key) ?? 0;
}

/** Persiste AppData somente se a lease ainda for vigente (ou lease omitida). */
export function saveAppDataIfSyncLeaseCurrent(
  lease: CooperativaSyncSessionLease | undefined,
  data: AppData
): boolean {
  if (lease && !lease.isCurrent()) {
    return false;
  }
  saveDataSafe(data);
  return true;
}

/** Publica a lease do `runSync` cooperado em curso (não incrementa generation). */
export function bindCooperadoRunSyncSessionLease(lease: CooperativaSyncSessionLease | null): void {
  boundCooperadoRunSyncSession = lease;
}

export function getCooperadoRunSyncSessionLease(): CooperativaSyncSessionLease | null {
  return boundCooperadoRunSyncSession;
}

/** Somente testes — zera contadores in-memory. */
export function resetOperacionalPullLeaseForTests(): void {
  generations.clear();
  boundCooperadoRunSyncSession = null;
}
