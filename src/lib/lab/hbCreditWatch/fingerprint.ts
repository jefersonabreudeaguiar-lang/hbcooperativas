import { createHash, randomBytes } from "crypto";

export function buildStableFingerprint(input: {
  coopCnpj: string;
  accountId: string;
  eventType: string;
  expectedCents: number | null;
  observedCents: number | null;
}): string {
  const payload = [
    input.coopCnpj.replace(/\D/g, ""),
    input.accountId,
    input.eventType,
    input.expectedCents ?? "null",
    input.observedCents ?? "null",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function buildFindingFingerprint(stableFingerprint: string): string {
  return `cwf_${stableFingerprint.slice(0, 24)}`;
}

export function buildSnapshotPayloadHash(accounts: Array<{ accountId: string; limitCents: number; usedCents: number; availableCents: number }>): string {
  const canonical = accounts
    .map((a) => `${a.accountId}:${a.limitCents}:${a.usedCents}:${a.availableCents}`)
    .sort()
    .join(";");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function buildProbeRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return `HB-CREDIT-WATCH-${ts}Z-${randomBytes(3).toString("hex")}`;
}

export function buildProbeRunKey(coopCnpj: string, probeType: string, intervalMinutes: number): string {
  const bucketMs = intervalMinutes * 60_000;
  const bucket = Math.floor(Date.now() / bucketMs);
  return `${coopCnpj.replace(/\D/g, "")}|${probeType}|${bucket}`;
}

export function buildSnapshotId(coopCnpj: string, runKey: string): string {
  return `snap_${createHash("sha256").update(`${coopCnpj}|${runKey}`).digest("hex").slice(0, 20)}`;
}
