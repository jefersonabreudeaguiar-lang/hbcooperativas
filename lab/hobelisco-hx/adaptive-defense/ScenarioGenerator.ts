import type { CampaignMode, GeneratedScenario, ScenarioSeverity, ThreatFamilyId } from "./types";
import { mapSequenceToChainStage } from "./ThreatKnowledgeBase";

export const GENERATOR_VERSION = "SG-1.0.0-LAB";

const FAMILIES: ThreatFamilyId[] = [
  "T01_AUTH", "T02_AUTHZ", "T03_INJECTION", "T04_WEB_API", "T05_CRYPTO",
  "T06_SESSION", "T07_RATE", "T09_CONFIG", "T10_INTEGRITY", "T11_SYNC",
  "T12_HB_CREDIT", "T13_ADMIN", "T14_INSIDER",
];

const VECTORS: Record<ThreatFamilyId, string[]> = {
  T01_AUTH: ["brute_force", "credential_stuffing", "password_spray", "session_abuse"],
  T02_AUTHZ: ["idor", "bola", "privilege_escalation", "tenant_bypass"],
  T03_INJECTION: ["sql_injection", "nosql_injection", "header_injection"],
  T04_WEB_API: ["ssrf", "csrf", "mass_assignment", "method_confusion"],
  T05_CRYPTO: ["invalid_signature", "replay", "nonce_reuse", "hash_mismatch"],
  T06_SESSION: ["session_fixation", "session_replay", "concurrent_anomaly"],
  T07_RATE: ["burst", "sustained_burst", "distributed_burst", "large_payload"],
  T08_SUPPLY: ["dependency_drift", "checksum_mismatch"],
  T09_CONFIG: ["debug_exposure", "unsafe_cors", "public_endpoint"],
  T10_INTEGRITY: ["tampered_payload", "audit_tamper", "metadata_manipulation"],
  T11_SYNC: ["sync_replay", "conflicting_update", "tampered_sync"],
  T12_HB_CREDIT: ["integrity_divergence", "cross_account", "unauthorized_access"],
  T13_ADMIN: ["admin_burst", "role_confusion", "endpoint_enumeration"],
  T14_INSIDER: ["unusual_access", "mass_export", "admin_sequence"],
};

const ROUTES = ["/api/auth/login", "/api/sync", "/api/credit", "/api/admin", "/api/cooperativa-sync"];
const IDENTITIES = ["anonymous", "cooperado", "responsavel", "admin", "expired_session"];
const DEFENSE_STATES = ["normal", "elevated", "fortress", "rate_limited"];

function mulberry32(a: number): () => number {
  let seed = a;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function severityFor(family: ThreatFamilyId, isLegit: boolean): ScenarioSeverity {
  if (isLegit) return "LOW";
  if (family === "T02_AUTHZ" || family === "T03_INJECTION" || family === "T05_CRYPTO") return "CRITICAL";
  if (family === "T01_AUTH" || family === "T12_HB_CREDIT") return "HIGH";
  return "MEDIUM";
}

export interface GenerateOptions {
  count: number;
  seed: number;
  campaignId: string;
  mode: CampaignMode;
  legitimateRatio?: number;
}

export function generateScenarios(options: GenerateOptions): GeneratedScenario[] {
  const { count, seed, campaignId, mode } = options;
  const legitRatio = options.legitimateRatio ?? (mode === "FULL" ? 0.15 : 0.1);
  const rng = mulberry32(seed);
  const scenarios: GeneratedScenario[] = [];

  for (let i = 0; i < count; i += 1) {
    const family = FAMILIES[Math.floor(rng() * FAMILIES.length)];
    const vectors = VECTORS[family];
    const vector = vectors[Math.floor(rng() * vectors.length)];
    const route = ROUTES[Math.floor(rng() * ROUTES.length)];
    const identity = IDENTITIES[Math.floor(rng() * IDENTITIES.length)];
    const frequency = Math.floor(rng() * 100) + 1;
    const timingMs = Math.floor(rng() * 300_000);
    const isLegitimate = rng() < legitRatio;
    const isUnknownVariant = !isLegitimate && rng() < 0.08;
    const sequence = isUnknownVariant
      ? [vector, "anomaly", ROUTES[(i + 3) % ROUTES.length].split("/").pop() ?? "unknown"]
      : [vector, route.split("/").pop() ?? "api"];

    scenarios.push({
      scenarioId: `${family.replace("T", "SC")}-${String(i).padStart(5, "0")}`,
      campaignId,
      family,
      vector,
      route,
      identityState: identity,
      timingMs,
      frequency,
      sequence,
      chainStage: mapSequenceToChainStage(sequence),
      severity: severityFor(family, isLegitimate),
      defenseState: DEFENSE_STATES[Math.floor(rng() * DEFENSE_STATES.length)],
      isLegitimate,
      isUnknownVariant,
      seed: seed + i,
      phase: "GENERATED",
    });
  }

  return scenarios;
}

export function mutateScenario(base: GeneratedScenario, mutation: string, index: number): GeneratedScenario {
  return {
    ...base,
    scenarioId: `${base.scenarioId}-M${index}`,
    timingMs: mutation.includes("timing") ? base.timingMs * 2 : base.timingMs,
    frequency: mutation.includes("frequency") ? base.frequency * 3 : base.frequency,
    sequence: mutation.includes("sequence") ? [...base.sequence, "variant"] : base.sequence,
    isUnknownVariant: true,
    phase: "GENERATED",
  };
}
