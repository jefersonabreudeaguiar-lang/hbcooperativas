/** Cenários legítimos diversos — medir falso positivo real */

import type { GeneratedScenario } from "./types";
import { mapSequenceToChainStage } from "./ThreatKnowledgeBase";

const LEGIT_PROFILES: Array<{
  family: GeneratedScenario["family"];
  vector: string;
  route: string;
  identity: string;
  frequency: number;
  sequence: string[];
}> = [
  { family: "T01_AUTH", vector: "normal_login", route: "/api/auth/login", identity: "cooperado", frequency: 1, sequence: ["login", "success"] },
  { family: "T11_SYNC", vector: "normal_sync", route: "/api/sync", identity: "cooperado", frequency: 2, sequence: ["sync", "ok"] },
  { family: "T12_HB_CREDIT", vector: "normal_credit_read", route: "/api/credit", identity: "cooperado", frequency: 1, sequence: ["read", "balance"] },
  { family: "T13_ADMIN", vector: "normal_admin", route: "/api/admin", identity: "admin", frequency: 3, sequence: ["admin", "dashboard"] },
  { family: "T07_RATE", vector: "normal_traffic", route: "/api/cooperativa-sync", identity: "responsavel", frequency: 5, sequence: ["sync", "batch"] },
  { family: "T06_SESSION", vector: "mobile_reconnect", route: "/api/auth/login", identity: "cooperado", frequency: 2, sequence: ["reconnect", "session"] },
  { family: "T02_AUTHZ", vector: "own_resource", route: "/api/credit", identity: "cooperado", frequency: 1, sequence: ["own", "account"] },
  { family: "T04_WEB_API", vector: "valid_request", route: "/api/sync", identity: "cooperado", frequency: 1, sequence: ["get", "status"] },
];

export function injectLegitimateScenarios(
  scenarios: GeneratedScenario[],
  seed: number,
  targetRatio = 0.2
): GeneratedScenario[] {
  const target = Math.floor(scenarios.length * targetRatio);
  let injected = 0;
  const out = [...scenarios];

  for (let i = 0; i < target && injected < target; i += 1) {
    const profile = LEGIT_PROFILES[i % LEGIT_PROFILES.length];
    const idx = (seed + i * 7919) % out.length;
    out[idx] = {
      ...out[idx],
      scenarioId: `LEGIT-${String(injected).padStart(5, "0")}`,
      family: profile.family,
      vector: profile.vector,
      route: profile.route,
      identityState: profile.identity,
      frequency: profile.frequency,
      sequence: profile.sequence,
      chainStage: mapSequenceToChainStage(profile.sequence),
      severity: "LOW",
      isLegitimate: true,
      isUnknownVariant: false,
      phase: "GENERATED",
    };
    injected += 1;
  }

  return out;
}

export function computeFalsePositiveByModule(results: Array<{ outcome: string; family?: string }>): Record<string, number> {
  const fp: Record<string, number> = {};
  for (const r of results) {
    if (r.outcome !== "FALSE_POSITIVE") continue;
    const mod = r.family ?? "unknown";
    fp[mod] = (fp[mod] ?? 0) + 1;
  }
  return fp;
}
