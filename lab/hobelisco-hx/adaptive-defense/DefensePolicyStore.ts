import { createHash } from "crypto";
import type { DefensePolicyRecord, PolicyDeploymentStage } from "./types";

export const DEFAULT_POLICY_VERSION = "DEFENSE-POLICY-v1";

const POLICIES: DefensePolicyRecord[] = [
  {
    policyId: "DEFENSE-POLICY",
    version: "v1",
    hash: "",
    rules: [
      "auth_failure>=5/5min → RATE_LIMIT",
      "idor|privilege → REJECT",
      "injection|replay → PAYLOAD_REJECTION",
      "credit_mutation → FINANCIAL_GUARD_BLOCK",
      "unknown_variant → CORRELATE+ALERT",
    ],
    approvedBy: "LAB_SYSTEM",
    approvedAt: "2026-09-09T00:00:00.000Z",
    stage: "LAB",
  },
];

for (const p of POLICIES) {
  p.hash = createHash("sha256").update(JSON.stringify({ id: p.policyId, version: p.version, rules: p.rules })).digest("hex").slice(0, 16);
}

export function getActivePolicy(stage: PolicyDeploymentStage = "LAB"): DefensePolicyRecord {
  return POLICIES.find((p) => p.stage === stage) ?? POLICIES[0];
}

export function listPolicies(): DefensePolicyRecord[] {
  return [...POLICIES];
}

export function verifyPolicyIntegrity(policy: DefensePolicyRecord): boolean {
  const expected = createHash("sha256")
    .update(JSON.stringify({ id: policy.policyId, version: policy.version, rules: policy.rules }))
    .digest("hex")
    .slice(0, 16);
  return expected === policy.hash;
}
