/** Barreira central OBSERVE-ONLY — server-side fail-closed */

import { evaluateFinancialAction } from "../financial/FinancialGuard";
import type { ObserveOnlyBlockResult } from "./types";

const FORBIDDEN_CATEGORIES = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "MIGRATION",
  "RPC_MUTATION",
  "CREDIT_MUTATION",
  "USER_MUTATION",
  "ROLE_MUTATION",
  "RLS_MUTATION",
  "CONFIG_MUTATION",
  "CODE_MUTATION",
  "REPAIR",
  "REMEDIATION",
  "BLOCK",
  "SUSPEND",
  "REFUND",
  "SETTLEMENT",
] as const;

export type MutationCategory = (typeof FORBIDDEN_CATEGORIES)[number];

function mapToFinancialAction(category: MutationCategory, target: string): string {
  const map: Partial<Record<MutationCategory, string>> = {
    CREDIT_MUTATION: "ALTER_CREDIT",
    REFUND: "ALTER_REFUND",
    SETTLEMENT: "ALTER_SETTLEMENT",
    MIGRATION: "RUN_MIGRATION",
    USER_MUTATION: "CREATE_ADMIN",
    RLS_MUTATION: "ALTER_RLS",
  };
  return map[category] ?? `ALTER_${category}`;
}

export function assertObserveOnly(
  category: MutationCategory,
  target = "hobelisco_v2"
): ObserveOnlyBlockResult | { blocked: false } {
  const fin = evaluateFinancialAction({
    action: mapToFinancialAction(category, target),
    target,
  });
  if (!fin.allowed) {
    return {
      blocked: true,
      category,
      reason: fin.reason,
      auditKind: "FINANCIAL_BOUNDARY_BLOCKED",
    };
  }

  if (FORBIDDEN_CATEGORIES.includes(category)) {
    return {
      blocked: true,
      category,
      reason: `OBSERVE-ONLY: ${category} proibido pelo HOBELISCO V2`,
      auditKind: "BOUNDARY_BLOCK",
    };
  }

  return { blocked: false };
}

export function blockAnyMutation(
  action: string,
  target = "hobelisco_v2"
): ObserveOnlyBlockResult | { blocked: false } {
  const upper = action.toUpperCase();
  if (["OBSERVE", "PERCEIVE", "READ", "LIST", "GET", "VERIFY"].some((a) => upper === a || upper.startsWith(`${a}_`))) {
    return { blocked: false };
  }
  for (const cat of FORBIDDEN_CATEGORIES) {
    if (upper.includes(cat) || upper.includes(cat.replace("_MUTATION", ""))) {
      const result = assertObserveOnly(cat, target);
      if (result.blocked) return result;
    }
  }
  const fin = evaluateFinancialAction({ action: upper, target });
  if (!fin.allowed) {
    return {
      blocked: true,
      category: "CREDIT_MUTATION",
      reason: fin.reason,
      auditKind: "FINANCIAL_BOUNDARY_BLOCKED",
    };
  }
  return {
    blocked: true,
    category: "UPDATE",
    reason: `HOBELISCO_V2_BOUNDARY_VIOLATION: ${action}`,
    auditKind: "HOBELISCO_V2_BOUNDARY_VIOLATION",
  };
}

export function listForbiddenCategories(): MutationCategory[] {
  return [...FORBIDDEN_CATEGORIES];
}
