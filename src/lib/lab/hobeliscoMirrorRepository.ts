/**
 * Persistência de snapshots do espelho prod → LAB (Supabase Hobelisco only)
 */

import { getStagingSupabaseClient } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import type { HobeliscoMirrorSnapshotRecord } from "./hobeliscoMirrorSync";

const TABLE = "hb_hobelisco_mirror_snapshots";

export async function saveMirrorSnapshot(
  record: HobeliscoMirrorSnapshotRecord
): Promise<{ ok: boolean; error?: string }> {
  const client = getStagingSupabaseClient();
  if (!client) {
    return { ok: false, error: "HOBELISCO_LAB_SUPABASE_NOT_CONFIGURED" };
  }

  const { error } = await client.from(TABLE).insert({
    id: record.id,
    synced_at: record.syncedAt,
    schema_version: record.schemaVersion,
    environment: record.environment,
    prod_commit_sha: record.prodCommitSha,
    prod_commit_ref: record.prodCommitRef,
    lab_commit_sha: record.labCommitSha,
    code_aligned: record.codeAligned,
    staleness_hours: record.stalenessHours,
    deploy_url: record.deployUrl,
    aggregates: record.aggregates,
    config_flags: record.configFlags,
    anonymized: record.anonymized,
    issues: record.issues,
    status: record.status,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getLatestMirrorSnapshot(): Promise<HobeliscoMirrorSnapshotRecord | null> {
  const client = getStagingSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    syncedAt: data.synced_at as string,
    schemaVersion: (data.schema_version as string) ?? "1.0",
    environment: (data.environment as string) ?? "LAB",
    prodCommitSha: (data.prod_commit_sha as string | null) ?? null,
    prodCommitRef: (data.prod_commit_ref as string | null) ?? null,
    labCommitSha: (data.lab_commit_sha as string | null) ?? null,
    codeAligned: Boolean(data.code_aligned),
    stalenessHours: Number(data.staleness_hours ?? 0),
    deployUrl: (data.deploy_url as string | null) ?? null,
    aggregates: (data.aggregates as Record<string, number>) ?? {},
    configFlags: (data.config_flags as Record<string, boolean>) ?? {},
    anonymized: true as const,
    issues: (data.issues as string[]) ?? [],
    status: ((data.status as string) ?? "OK") as HobeliscoMirrorSnapshotRecord["status"],
  };
}
