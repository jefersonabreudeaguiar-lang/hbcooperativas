/** Threat DNA + fingerprint THREAT-FP-XXXXXXXX */

import { createHash } from "crypto";
import type { ThreatFingerprint } from "../types";

export function buildThreatFingerprint(input: {
  sequence: string[];
  endpoint?: string;
  cooperativeCnpj?: string;
  userRole?: string;
  failures?: number;
  windowMs?: number;
}): string {
  const payload = JSON.stringify({
    seq: input.sequence,
    ep: input.endpoint ?? "",
    cnpj: input.cooperativeCnpj ?? "",
    role: input.userRole ?? "",
    fail: input.failures ?? 0,
  });
  return `THREAT-FP-${createHash("sha256").update(payload).digest("hex").slice(0, 8).toUpperCase()}`;
}

export function classifyThreat(input: {
  sequence: string[];
  endpoint?: string;
  cooperativeCnpj?: string;
  userRole?: string;
  failures?: number;
  windowMs?: number;
}): ThreatFingerprint {
  const failures = input.failures ?? 0;
  let severity: ThreatFingerprint["severity"] = "low";

  if (input.sequence.includes("cross_coop_probe") || input.sequence.includes("alter_ledger")) {
    severity = "critical";
  } else if (failures > 10 || input.sequence.includes("idor")) {
    severity = "high";
  } else if (failures > 3) {
    severity = "medium";
  }

  const fingerprint = buildThreatFingerprint(input);

  return {
    id: `threat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fingerprint,
    sequence: input.sequence,
    endpoint: input.endpoint,
    cooperativeCnpj: input.cooperativeCnpj,
    userRole: input.userRole,
    severity,
    classifiedAt: new Date().toISOString(),
  };
}

export function behaviorFingerprint(events: string[]): string {
  return buildThreatFingerprint({ sequence: events.slice(-8) });
}
