/**
 * Fase 1 — ProdMirrorSync: espelho read-only prod → LAB
 * Nunca escreve em produção. Snapshots anonimizados no Supabase Hobelisco.
 */

import { createPersistenceId } from "@lab/hobelisco-hx/persistence/HobeliscoPersistence";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  evaluateHobeliscoLabBoundary,
  isHobeliscoMirrorMode,
  listActiveHobeliscoFlags,
} from "./hobeliscoLabBoundary";
import { getLatestMirrorSnapshot, saveMirrorSnapshot } from "./hobeliscoMirrorRepository";

export const MIRROR_STALE_HOURS = 24;

export interface HobeliscoMirrorSnapshotRecord {
  id: string;
  syncedAt: string;
  schemaVersion: string;
  environment: string;
  prodCommitSha: string | null;
  prodCommitRef: string | null;
  labCommitSha: string | null;
  codeAligned: boolean;
  stalenessHours: number;
  deployUrl: string | null;
  aggregates: Record<string, number>;
  configFlags: Record<string, boolean>;
  anonymized: true;
  issues: string[];
  status: "OK" | "WARN" | "BLOCKED";
}

export interface MirrorSyncResult {
  ok: boolean;
  blocked: boolean;
  reason?: string;
  snapshot?: HobeliscoMirrorSnapshotRecord;
}

function readDeployContext(env: NodeJS.ProcessEnv = process.env): {
  labCommitSha: string | null;
  prodCommitRef: string | null;
  deployUrl: string | null;
} {
  return {
    labCommitSha:
      env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      env.GITHUB_SHA?.trim() ||
      env.HB_HOBELISCO_LAB_COMMIT_SHA?.trim() ||
      null,
    prodCommitRef: env.HB_HOBELISCO_MIRROR_PROD_REF?.trim() || "main",
    deployUrl: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null,
  };
}

async function fetchProdMainCommitSha(
  env: NodeJS.ProcessEnv = process.env
): Promise<string | null> {
  const explicit = env.HB_HOBELISCO_MIRROR_PROD_COMMIT_SHA?.trim();
  if (explicit) return explicit;

  const repo =
    env.HB_HOBELISCO_MIRROR_GITHUB_REPO?.trim() || "jefersonabreudeaguiar-lang/hbcooperativas";
  const ref = env.HB_HOBELISCO_MIRROR_PROD_REF?.trim() || "main";

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${ref}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { sha?: string };
    return json.sha?.slice(0, 12) ?? null;
  } catch {
    return null;
  }
}

async function countTable(table: string): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

async function collectAggregates(env: NodeJS.ProcessEnv = process.env): Promise<Record<string, number>> {
  if (!isSupabaseConfigured() || env.HB_HOBELISCO_MIRROR_SKIP_DB_AGGREGATES === "true") {
    return {};
  }

  const aggregates: Record<string, number> = {};
  const tables = ["cooperativas", "app_users"];

  for (const table of tables) {
    const count = await countTable(table);
    if (count != null) aggregates[`${table}_count`] = count;
  }

  return aggregates;
}

function buildConfigFlagsSnapshot(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  const flags = listActiveHobeliscoFlags(env);
  const snapshot: Record<string, boolean> = {};
  for (const key of flags) snapshot[key] = true;
  snapshot.HB_HOBELISCO_MIRROR_ENABLED = isHobeliscoMirrorMode(env);
  return snapshot;
}

export function canRunMirrorSync(env: NodeJS.ProcessEnv = process.env): {
  allowed: boolean;
  reason?: string;
} {
  const boundary = evaluateHobeliscoLabBoundary(env);
  if (boundary.productionLocked) {
    return { allowed: false, reason: "PRODUCTION_DEPLOY_LOCKED" };
  }
  if (!isHobeliscoMirrorMode(env)) {
    return { allowed: false, reason: "MIRROR_DISABLED" };
  }
  if (boundary.tripwires.some((t) => t.severity === "BLOCK")) {
    return { allowed: false, reason: "BOUNDARY_BLOCKED" };
  }
  return { allowed: true };
}

export async function runProdMirrorSync(
  env: NodeJS.ProcessEnv = process.env
): Promise<MirrorSyncResult> {
  const gate = canRunMirrorSync(env);
  if (!gate.allowed) {
    return { ok: false, blocked: true, reason: gate.reason };
  }

  const issues: string[] = [];
  const syncedAt = new Date().toISOString();
  const deploy = readDeployContext(env);
  const prodCommitSha = await fetchProdMainCommitSha(env);
  const prodShort = prodCommitSha?.slice(0, 7) ?? null;
  const labShort = deploy.labCommitSha?.slice(0, 7) ?? null;

  const codeAligned = Boolean(prodShort && labShort && prodShort === labShort);
  if (!codeAligned) {
    issues.push(
      `Código LAB (${labShort ?? "?"}) diverge de prod/main (${prodShort ?? "?"}).`
    );
  }

  const aggregates = await collectAggregates(env);
  if (Object.keys(aggregates).length === 0) {
    issues.push("Agregados Supabase indisponíveis — snapshot parcial (somente git/deploy).");
  }

  const previous = await getLatestMirrorSnapshot();
  let stalenessHours = 0;
  if (previous?.syncedAt) {
    stalenessHours =
      (Date.now() - new Date(previous.syncedAt).getTime()) / (1000 * 60 * 60);
  }

  const status: HobeliscoMirrorSnapshotRecord["status"] =
    issues.some((i) => i.includes("diverge")) ? "WARN" : "OK";

  const snapshot: HobeliscoMirrorSnapshotRecord = {
    id: createPersistenceId("mirror"),
    syncedAt,
    schemaVersion: "1.0",
    environment: "LAB",
    prodCommitSha: prodShort,
    prodCommitRef: deploy.prodCommitRef,
    labCommitSha: labShort,
    codeAligned,
    stalenessHours: Math.round(stalenessHours * 10) / 10,
    deployUrl: deploy.deployUrl,
    aggregates,
    configFlags: buildConfigFlagsSnapshot(env),
    anonymized: true,
    issues,
    status,
  };

  const saved = await saveMirrorSnapshot(snapshot);
  if (!saved.ok) {
    return { ok: false, blocked: false, reason: saved.error ?? "SAVE_FAILED" };
  }

  return { ok: true, blocked: false, snapshot };
}

export async function getMirrorSyncStatus(env: NodeJS.ProcessEnv = process.env): Promise<{
  enabled: boolean;
  lastSnapshot: HobeliscoMirrorSnapshotRecord | null;
  stale: boolean;
  staleHours: number;
  codeAligned: boolean;
  issues: string[];
}> {
  const enabled = isHobeliscoMirrorMode(env) && !evaluateHobeliscoLabBoundary(env).productionLocked;
  const lastSnapshot = await getLatestMirrorSnapshot();
  const staleHours = lastSnapshot
    ? (Date.now() - new Date(lastSnapshot.syncedAt).getTime()) / (1000 * 60 * 60)
    : Infinity;

  return {
    enabled,
    lastSnapshot,
    stale: staleHours > MIRROR_STALE_HOURS,
    staleHours: Number.isFinite(staleHours) ? Math.round(staleHours * 10) / 10 : staleHours,
    codeAligned: lastSnapshot?.codeAligned ?? false,
    issues: lastSnapshot?.issues ?? [],
  };
}
