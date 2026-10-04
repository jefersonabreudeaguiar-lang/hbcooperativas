/**
 * Cooperado: sync operacional só quando há motivo explícito —
 * lançamento do responsável na nuvem, nova versão do app ou primeira carga local.
 */

import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { normalizeCnpj } from "@/utils/cooperativa";
import { isCooperadoManualOperacionalSync } from "@/lib/performance/cooperadoColdStart";

const APPLIED_REV_PREFIX = "hb-coop-applied-cloud-rev:";
const SYNCED_BUILD_KEY = "hb-coop-operacional-synced-build";

export type CooperativaCloudRevision = {
  operacionalUpdatedAt: string | null;
  operationalResetVersion: number;
  contratosUpdatedAt: string | null;
  notasUpdatedAt: string | null;
};

export function isCooperadoEventDrivenSync(): boolean {
  if (!isCooperadoManualOperacionalSync()) return false;
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_COOPERADO_EVENT_DRIVEN_SYNC ?? "true")
      : "true";
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function fingerprintCooperativaCloudRevision(rev: CooperativaCloudRevision): string {
  return [
    rev.operacionalUpdatedAt ?? "",
    String(rev.operationalResetVersion ?? 0),
    rev.contratosUpdatedAt ?? "",
    rev.notasUpdatedAt ?? "",
  ].join("|");
}

export function readAppliedCooperativaCloudRevision(cnpj: string): string | null {
  if (typeof window === "undefined") return null;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  return localStorage.getItem(`${APPLIED_REV_PREFIX}${digits}`);
}

export function persistAppliedCooperativaCloudRevision(cnpj: string, fingerprint: string): void {
  if (typeof window === "undefined") return;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !fingerprint) return;
  localStorage.setItem(`${APPLIED_REV_PREFIX}${digits}`, fingerprint);
}

export function cloudRevisionChangedSinceApplied(
  cnpj: string,
  remote: CooperativaCloudRevision
): boolean {
  const fp = fingerprintCooperativaCloudRevision(remote);
  const applied = readAppliedCooperativaCloudRevision(cnpj);
  if (!applied) return true;
  return applied !== fp;
}

let eventDrivenGrantDepth = 0;

export function grantCooperadoEventDrivenSync(): void {
  eventDrivenGrantDepth += 1;
}

export function consumeCooperadoEventDrivenSyncGrant(): void {
  eventDrivenGrantDepth = Math.max(0, eventDrivenGrantDepth - 1);
}

export function hasCooperadoEventDrivenGrant(): boolean {
  return eventDrivenGrantDepth > 0;
}

export function resetCooperadoEventDrivenSyncForTests(): void {
  eventDrivenGrantDepth = 0;
}

export function getLastOperacionalSyncedAppBuild(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(SYNCED_BUILD_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function persistOperacionalSyncedAppBuild(build = APP_BUILD_VERSION): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNCED_BUILD_KEY, String(build));
}

/** Nova versão publicada do app — uma sync operacional após o runtime canônico carregar. */
export function cooperadoAppReleaseNeedsOperacionalSync(): boolean {
  if (!isCooperadoEventDrivenSync()) return false;
  return getLastOperacionalSyncedAppBuild() !== APP_BUILD_VERSION;
}
