/** Hobelisco 10X — Security Fabric (orquestra guards existentes, fail-open) */

import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { layersForFamily } from "../adaptive-defense/DefenseLayers";
import type { ThreatFamilyId } from "../adaptive-defense/types";

export type FabricMode = "OFF" | "OBSERVE" | "SHADOW" | "CONTROLLED_BLOCK";

export interface FabricDecision {
  mode: FabricMode;
  module: string;
  wouldAlert: boolean;
  wouldBlock: boolean;
  blocked: boolean;
  action: string | null;
  reason: string;
  evidence: string[];
  policyId: string | null;
}

export interface FabricContext {
  family: ThreatFamilyId | string;
  route: string;
  severity: string;
  frequency: number;
  sequence: string[];
  identityState: string;
  isLegitimate: boolean;
  environment: string;
}

const APPROVED_BLOCK_POLICIES = new Set([
  "POL-T03-INJECTION-REJECT",
  "POL-T05-CRYPTO-REPLAY",
  "POL-T02-AUTHZ-REJECT",
  "POL-T12-CREDIT-CROSS",
  "POL-T01-AUTH-BURST",
  "POL-T06-SESSION-REPLAY",
  "POL-T11-SYNC-REPLAY",
  "POL-T07-RATE-BURST",
]);

export function loadFabricMode(env: NodeJS.ProcessEnv = process.env): FabricMode {
  if (env.HOBELISCO_ENVIRONMENT?.toUpperCase() === "PRODUCTION") return "OFF";
  if (["false", "0", "no"].includes((env.HOBELISCO_LAB_ENABLED ?? "true").trim().toLowerCase()) && env.NODE_ENV === "production") {
    return "OFF";
  }
  const raw = (env.HOBELISCO_FABRIC_MODE ?? env.HOBELISCO_SHADOW_MODE === "true" ? "SHADOW" : "OBSERVE").toUpperCase();
  if (raw === "SHADOW" || raw === "CONTROLLED_BLOCK" || raw === "OBSERVE" || raw === "OFF") return raw;
  return "OBSERVE";
}

export class HobeliscoSecurityFabric {
  readonly mode: FabricMode;

  constructor(mode?: FabricMode) {
    this.mode = mode ?? loadFabricMode();
  }

  evaluate(ctx: FabricContext): FabricDecision {
    const evidence: string[] = [];
    const layers = layersForFamily(ctx.family);
    evidence.push(`layers=${layers.map((l) => l.id).join(",")}`);

    if (ctx.isLegitimate) {
      return {
        mode: this.mode,
        module: "Fabric",
        wouldAlert: false,
        wouldBlock: false,
        blocked: false,
        action: null,
        reason: "legitimate_traffic",
        evidence,
        policyId: null,
      };
    }

    const fin = evaluateFinancialAction({ action: "FABRIC_EVAL", target: ctx.route });
    if (!fin.allowed) {
      evidence.push("financial_boundary");
    }

    const policy = this.resolvePolicy(ctx);
    if (policy) evidence.push(`policy=${policy.id}`);

    const wouldBlock = Boolean(policy?.wouldBlock);
    const wouldAlert = Boolean(policy?.wouldAlert ?? wouldBlock);

    let blocked = false;
    let action: string | null = policy?.action ?? null;

    if (this.mode === "CONTROLLED_BLOCK" && wouldBlock && policy && APPROVED_BLOCK_POLICIES.has(policy.id)) {
      blocked = true;
    }

    return {
      mode: this.mode,
      module: policy?.module ?? "Fabric",
      wouldAlert,
      wouldBlock,
      blocked,
      action,
      reason: policy?.reason ?? "no_policy_match",
      evidence,
      policyId: policy?.id ?? null,
    };
  }

  private resolvePolicy(ctx: FabricContext): {
    id: string;
    module: string;
    action: string;
    wouldBlock: boolean;
    wouldAlert: boolean;
    reason: string;
  } | null {
    const f = ctx.family;
    const freq = ctx.frequency;

    if (f === "T01_AUTH" && freq >= 5) {
      return {
        id: "POL-T01-AUTH-BURST",
        module: "AuthRiskEngine",
        action: freq >= 20 ? "TEMPORARY_BLOCK" : "RATE_LIMIT",
        wouldBlock: freq >= 10,
        wouldAlert: true,
        reason: `auth_failure_burst frequency=${freq}`,
      };
    }

    if (f === "T06_SESSION") {
      const replay = ctx.sequence.some((s) => s.includes("replay") || s.includes("fixation"));
      return {
        id: "POL-T06-SESSION-REPLAY",
        module: "SessionGuard",
        action: replay ? "REJECT" : "SESSION_INVALIDATION",
        wouldBlock: replay,
        wouldAlert: true,
        reason: replay ? "session_replay_detected" : "session_anomaly",
      };
    }

    if (f === "T02_AUTHZ" || ctx.sequence.some((s) => s.includes("idor") || s.includes("privilege") || s.includes("tenant"))) {
      return {
        id: "POL-T02-AUTHZ-REJECT",
        module: "TenantGuard",
        action: "REJECT",
        wouldBlock: true,
        wouldAlert: true,
        reason: "authorization_or_cross_tenant",
      };
    }

    if (f === "T12_HB_CREDIT") {
      const cross = ctx.sequence.some((s) => s.includes("cross") || s.includes("unauthorized"));
      const integrity = ctx.sequence.some((s) => s.includes("integrity") || s.includes("divergence"));
      return {
        id: cross ? "POL-T12-CREDIT-CROSS" : "POL-T12-CREDIT-ALERT",
        module: "CreditGuard",
        action: cross ? "REJECT" : "ALERT",
        wouldBlock: cross,
        wouldAlert: integrity || cross || freq >= 3,
        reason: cross ? "cross_account_credit_access" : "credit_integrity_signal",
      };
    }

    if (f === "T03_INJECTION" || f === "T05_CRYPTO") {
      return {
        id: f === "T03_INJECTION" ? "POL-T03-INJECTION-REJECT" : "POL-T05-CRYPTO-REPLAY",
        module: f === "T03_INJECTION" ? "ApiGuard" : "IntegrityGuard",
        action: "PAYLOAD_REJECTION",
        wouldBlock: true,
        wouldAlert: true,
        reason: "injection_or_integrity",
      };
    }

    if (f === "T11_SYNC") {
      return {
        id: "POL-T11-SYNC-REPLAY",
        module: "SyncGuard",
        action: "REPLAY_REJECTION",
        wouldBlock: ctx.sequence.some((s) => s.includes("replay") || s.includes("tampered")),
        wouldAlert: true,
        reason: "sync_anomaly",
      };
    }

    if (f === "T07_RATE" && freq >= 15) {
      return {
        id: "POL-T07-RATE-BURST",
        module: "AbuseEngine",
        action: freq >= 50 ? "TEMPORARY_BLOCK" : "RATE_LIMIT",
        wouldBlock: freq >= 30,
        wouldAlert: true,
        reason: `rate_burst frequency=${freq}`,
      };
    }

    if (ctx.severity === "CRITICAL") {
      return {
        id: "POL-GENERIC-CRITICAL",
        module: "BehaviorEngine",
        action: "REJECT",
        wouldBlock: true,
        wouldAlert: true,
        reason: "critical_severity",
      };
    }

    return {
      id: "POL-OBSERVE-ONLY",
      module: "BehaviorEngine",
      action: "ALERT",
      wouldBlock: false,
      wouldAlert: true,
      reason: "observe_anomaly",
    };
  }
}
