/** Barreira LAB — fail closed contra produção/staging/recursos reais */

import type { AuditChain } from "../audit/AuditChain";
import type { BlockedResourceKind, BoundaryResult, LabResourceKind } from "./types";

const ALLOWED: LabResourceKind[] = [
  "LAB_MEMORY",
  "LAB_DATABASE",
  "LAB_EVENT_BUS",
  "LAB_ACTORS",
  "LAB_ARENA",
  "LAB_COOPERATIVES",
  "LAB_MARKETS",
];

const BLOCKED_PATTERNS: { pattern: RegExp; label: BlockedResourceKind }[] = [
  { pattern: /PRODUCTION|PROD_/i, label: "PRODUCTION" },
  { pattern: /STAGING/i, label: "STAGING" },
  { pattern: /REAL_DATABASE|SUPABASE.*PROD|@supabase/i, label: "REAL_DATABASE" },
  { pattern: /REAL_HB_CREDIT|HB_CREDIT.*PROD/i, label: "REAL_HB_CREDIT" },
  { pattern: /REAL_LEDGER|LEDGER.*PROD/i, label: "REAL_LEDGER" },
  { pattern: /REAL_USER|PROD_AUTH/i, label: "REAL_USER" },
  { pattern: /REAL_PAYMENT|PROD_API/i, label: "REAL_PAYMENT" },
  { pattern: /PROD_DATABASE|PROD_AUTH|PROD_HB_CREDIT|PROD_LEDGER|PROD_API/i, label: "PRODUCTION" },
];

export class LabBoundary {
  private violations = 0;

  constructor(private audit?: AuditChain) {}

  check(resource: string): BoundaryResult {
    for (const { pattern, label } of BLOCKED_PATTERNS) {
      if (pattern.test(resource)) {
        return this.block(resource, label);
      }
    }

    const upper = resource.toUpperCase();
    if (ALLOWED.some((a) => upper.includes(a))) {
      return { blocked: false, resource: upper as LabResourceKind };
    }

    if (/^(PROD|REAL|STAGING)/i.test(resource)) {
      return this.block(resource, "PRODUCTION");
    }

    return { blocked: false, resource: "LAB_MEMORY" };
  }

  assertLabOnly(resource: string): void {
    const result = this.check(resource);
    if (result.blocked) {
      throw new Error(`${result.reason}: ${resource}`);
    }
  }

  get violationCount(): number {
    return this.violations;
  }

  private block(resource: string, label: BlockedResourceKind): BoundaryBlockResult {
    this.violations += 1;
    this.audit?.append("LAB_BOUNDARY_BLOCK", { resource, label, reason: "BLOCKED_BY_LAB_BOUNDARY" });
    return {
      blocked: true,
      reason: "BLOCKED_BY_LAB_BOUNDARY",
      resource: label,
      auditKind: "LAB_BOUNDARY_BLOCK",
    };
  }
}

type BoundaryBlockResult = Extract<BoundaryResult, { blocked: true }>;
