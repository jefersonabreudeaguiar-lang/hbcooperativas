/**
 * Orquestra pull operacional após hint de lançamento (staff → cooperado).
 * Extraído do hook para testes e para fallback quando revisionOnly falha.
 */
import type { User } from "@/types";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  fingerprintCooperativaCloudRevision,
  persistAppliedCooperativaCloudRevision,
  persistCooperadoLastOperacionalSyncAt,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { watchBicCooperativaCloudRevision } from "@/lib/bic/bicRevisionWatch";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { runCooperadoMessengerOperacionalLightPull } from "@/lib/cooperado/cooperadoMessengerOperacionalLightPull";
import { syncCooperadoMessengerOperacionalLightFromCloud } from "@/services/cooperativaSyncCloudService";
import { requestCooperadoStaffRevisionSync } from "@/services/syncRequest";
import { normalizeCnpj } from "@/utils/cooperativa";

const REVISION_RETRY_DELAYS_MS = [0, 300, 600] as const;
/**
 * Cooldown do fallback light pull (sem revisão prévia).
 * Hint poll ≈4s — 45s limita a ~1 pull operacional por rajada enquanto revisionOnly falha;
 * revisão ainda é reconsultada a cada ciclo (barato) para recuperação rápida.
 */
export const COOPERADO_HINT_LIGHT_PULL_FALLBACK_COOLDOWN_MS = 45_000;
/** Evita operacional_full a cada 4s enquanto revisionOnly segue indisponível. */
const DELEGATED_FULL_MIN_GAP_MS = 60_000;

export type CooperadoHintOperacionalSyncOutcome =
  | { status: "synced"; remote: CooperativaCloudRevision }
  | { status: "retry" }
  | { status: "delegated_operacional_full" };

export type CooperadoHintOperacionalSyncDeps = {
  watchRevision: (cnpj: string) => Promise<CooperativaCloudRevision | null>;
  runLightPull: (opts: {
    cnpj: string;
    cooperativaId: string;
    user: Omit<User, "password">;
    remote: CooperativaCloudRevision;
  }) => Promise<boolean>;
  syncLightFromCloud: (cnpj: string, cooperativaId: string) => Promise<void>;
  materializeSnapshots: (user: Omit<User, "password">) => void;
  persistRevisionApplied: (cnpj: string, remote: CooperativaCloudRevision) => void;
  requestStaffRevisionSync: () => void;
  sleep: (ms: number) => Promise<void>;
  /** Testes — relógio injetável. */
  now?: () => number;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultPersistRevisionApplied(cnpj: string, remote: CooperativaCloudRevision): void {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  persistAppliedCooperativaCloudRevision(digits, fingerprintCooperativaCloudRevision(remote));
  persistCooperadoLastOperacionalSyncAt();
  clearCooperadoPwaDadosDesatualizados();
}

export const defaultCooperadoHintOperacionalSyncDeps: CooperadoHintOperacionalSyncDeps = {
  watchRevision: watchBicCooperativaCloudRevision,
  runLightPull: runCooperadoMessengerOperacionalLightPull,
  syncLightFromCloud: syncCooperadoMessengerOperacionalLightFromCloud,
  materializeSnapshots: cooperadoPwaMaterializarSnapshotsFinanceirosPosSync,
  persistRevisionApplied: defaultPersistRevisionApplied,
  requestStaffRevisionSync: requestCooperadoStaffRevisionSync,
  sleep: defaultSleep,
  now: undefined,
};

let pullWithoutRevisionInflight: Promise<boolean> | null = null;
let pullWithoutRevisionInflightKey: string | null = null;
const lastDelegatedFullAtByCnpj = new Map<string, number>();
const lastLightPullFallbackAtByKey = new Map<string, number>();

function fallbackPullKey(cnpj: string, cooperativaId: string): string {
  return `${normalizeCnpj(cnpj)}|${cooperativaId}`;
}

function nowMs(deps: CooperadoHintOperacionalSyncDeps): number {
  return deps.now?.() ?? Date.now();
}

/** Testes — estado in-memory. */
export function resetCooperadoHintOperacionalSyncForTests(): void {
  pullWithoutRevisionInflight = null;
  pullWithoutRevisionInflightKey = null;
  lastDelegatedFullAtByCnpj.clear();
  lastLightPullFallbackAtByKey.clear();
}

async function watchRevisionWithRetries(
  deps: CooperadoHintOperacionalSyncDeps,
  cnpj: string
): Promise<CooperativaCloudRevision | null> {
  for (let i = 0; i < REVISION_RETRY_DELAYS_MS.length; i++) {
    const delay = REVISION_RETRY_DELAYS_MS[i];
    if (delay > 0) await deps.sleep(delay);
    const remote = await deps.watchRevision(cnpj);
    if (remote) return remote;
  }
  return null;
}

async function pullOperacionalLightWithoutPriorRevision(
  deps: CooperadoHintOperacionalSyncDeps,
  cnpj: string,
  cooperativaId: string,
  user: Omit<User, "password">
): Promise<boolean> {
  const key = `${cnpj}|${cooperativaId}`;
  if (pullWithoutRevisionInflight && pullWithoutRevisionInflightKey === key) {
    return pullWithoutRevisionInflight;
  }

  pullWithoutRevisionInflightKey = key;
  pullWithoutRevisionInflight = (async () => {
    try {
      await deps.syncLightFromCloud(cnpj, cooperativaId);
      deps.materializeSnapshots(user);
      return true;
    } catch {
      return false;
    } finally {
      if (pullWithoutRevisionInflightKey === key) {
        pullWithoutRevisionInflight = null;
        pullWithoutRevisionInflightKey = null;
      }
    }
  })();

  return pullWithoutRevisionInflight;
}

function maybeDelegateOperacionalFull(
  deps: CooperadoHintOperacionalSyncDeps,
  cnpj: string
): CooperadoHintOperacionalSyncOutcome {
  const digits = normalizeCnpj(cnpj);
  const now = Date.now();
  const last = lastDelegatedFullAtByCnpj.get(digits) ?? 0;
  if (now - last < DELEGATED_FULL_MIN_GAP_MS) {
    return { status: "retry" };
  }
  lastDelegatedFullAtByCnpj.set(digits, now);
  deps.requestStaffRevisionSync();
  return { status: "delegated_operacional_full" };
}

/**
 * Pull operacional após hint novo. Só retorna `synced` com revisão real pós-merge
 * (nunca fingerprint inventado).
 */
export async function pullOperacionalAfterCooperadoLancamentoHint(
  opts: {
    cnpj: string;
    cooperativaId: string;
    user: Omit<User, "password">;
  },
  deps: CooperadoHintOperacionalSyncDeps = defaultCooperadoHintOperacionalSyncDeps
): Promise<CooperadoHintOperacionalSyncOutcome> {
  const digits = normalizeCnpj(opts.cnpj);
  if (digits.length !== 14 || !opts.cooperativaId || opts.user.role !== "cooperado") {
    return { status: "retry" };
  }

  let remote = await watchRevisionWithRetries(deps, digits);
  if (remote) {
    const ok = await deps.runLightPull({
      cnpj: digits,
      cooperativaId: opts.cooperativaId,
      user: opts.user,
      remote,
    });
    return ok ? { status: "synced", remote } : { status: "retry" };
  }

  const fallbackKey = fallbackPullKey(digits, opts.cooperativaId);
  const now = nowMs(deps);
  const lastFallbackPull = lastLightPullFallbackAtByKey.get(fallbackKey);
  const withinFallbackCooldown =
    lastFallbackPull !== undefined &&
    now - lastFallbackPull < COOPERADO_HINT_LIGHT_PULL_FALLBACK_COOLDOWN_MS;

  if (withinFallbackCooldown) {
    remote = await deps.watchRevision(digits);
    if (remote) {
      const ok = await deps.runLightPull({
        cnpj: digits,
        cooperativaId: opts.cooperativaId,
        user: opts.user,
        remote,
      });
      return ok ? { status: "synced", remote } : { status: "retry" };
    }
    return maybeDelegateOperacionalFull(deps, digits);
  }

  lastLightPullFallbackAtByKey.set(fallbackKey, now);
  const pulled = await pullOperacionalLightWithoutPriorRevision(
    deps,
    digits,
    opts.cooperativaId,
    opts.user
  );
  if (!pulled) {
    return { status: "retry" };
  }

  remote = await deps.watchRevision(digits);
  if (remote) {
    deps.persistRevisionApplied(digits, remote);
    return { status: "synced", remote };
  }

  return maybeDelegateOperacionalFull(deps, digits);
}
