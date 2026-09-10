/** Proteção financeira absoluta — fail closed */

import type { FinancialActionAttempt } from "../types";
import { assertInvariant } from "../dna/invariants";

const FORBIDDEN_PREFIXES = [
  "ALTER_LEDGER",
  "ALTER_CREDIT",
  "ALTER_SETTLEMENT",
  "ALTER_RECEIVABLE",
  "ALTER_REFUND",
  "ALTER_BALANCE",
  "ALTER_FINANCIAL_RULE",
  "ALTER_RLS",
  "ALTER_HISTORY",
  "ALTER_COOPERATIVE",
] as const;

/** Ações absolutamente proibidas — barreira financeira + infra crítica (FASE 15) */
const FORBIDDEN_EXACT = [
  "RUN_MIGRATION",
  "CREATE_ADMIN",
  "DELETE_HISTORY",
  "NEGATIVE_CREDIT",
  "DUPLICATE_REFUND",
  "CHANGE_COOPERATIVE",
  "CREATE_CREDIT",
  "CONSUME_CREDIT",
  "REFUND",
  "SETTLEMENT",
  "LEDGER_UPDATE",
] as const;

export type FinancialGuardVerdict =
  | { allowed: false; freeze: true; incident: true; humanRequired: true; reason: string }
  | { allowed: true };

export function evaluateFinancialAction(attempt: FinancialActionAttempt): FinancialGuardVerdict {
  assertInvariant("INVARIANT_LEDGER_IMMUTABILITY");
  assertInvariant("INVARIANT_NO_NEGATIVE_CREDIT");

  const upper = attempt.action.toUpperCase();
  const blockedExact = FORBIDDEN_EXACT.some((a) => upper === a || upper.includes(a));
  const blockedPrefix = FORBIDDEN_PREFIXES.some((p) => upper.startsWith(p) || upper.includes(p));

  if (blockedExact || blockedPrefix) {
    return {
      allowed: false,
      freeze: true,
      incident: true,
      humanRequired: true,
      reason: `Ação financeira proibida pelo HOBELISCO: ${attempt.action} → ${attempt.target}`,
    };
  }

  return { allowed: true };
}

export function isFinancialMutation(action: string): boolean {
  return FORBIDDEN_PREFIXES.some((p) => action.toUpperCase().includes(p.replace("ALTER_", "")));
}
