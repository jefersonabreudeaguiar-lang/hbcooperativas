import { evaluateFinancialAction } from "../financial/FinancialGuard";
import type { CyberDefenseAction } from "./types";

/** Fronteira cyber defense — permite ações técnicas em LAB, nunca mutação financeira */

const CYBER_ACTIONS: CyberDefenseAction[] = [
  "REJECT",
  "RATE_LIMIT",
  "BACKOFF",
  "TEMPORARY_BLOCK",
  "SESSION_INVALIDATION",
  "QUARANTINE",
  "REPLAY_REJECTION",
  "PAYLOAD_REJECTION",
];

export interface ActiveDefenseResult {
  executed: boolean;
  action: CyberDefenseAction | null;
  blocked: boolean;
  reason: string;
  auditId: string;
  expiresAt: string | null;
}

export class ActiveDefenseExecutor {
  private actionLog: ActiveDefenseResult[] = [];

  execute(action: CyberDefenseAction, context: {
    target: string;
    family: string;
    environment: string;
  }): ActiveDefenseResult {
    if (context.environment === "PRODUCTION") {
      return {
        executed: false,
        action: null,
        blocked: false,
        reason: "ACTIVE_DEFENSE_DISABLED_IN_PRODUCTION",
        auditId: "",
        expiresAt: null,
      };
    }

    const finCheck = evaluateFinancialAction({ action: `CYBER_${action}`, target: context.target });
    if (!finCheck.allowed && finCheck.reason.includes("financial")) {
      return {
        executed: false,
        action: null,
        blocked: false,
        reason: "FINANCIAL_BOUNDARY: cyber action cannot mutate financial state",
        auditId: `audit_block_${Date.now()}`,
        expiresAt: null,
      };
    }

    if (!CYBER_ACTIONS.includes(action)) {
      return {
        executed: false,
        action: null,
        blocked: false,
        reason: "UNKNOWN_CYBER_ACTION",
        auditId: "",
        expiresAt: null,
      };
    }

    const ttlMs = action === "TEMPORARY_BLOCK" ? 900_000 : action === "RATE_LIMIT" ? 60_000 : null;
    const result: ActiveDefenseResult = {
      executed: true,
      action,
      blocked: ["REJECT", "REPLAY_REJECTION", "PAYLOAD_REJECTION", "QUARANTINE", "TEMPORARY_BLOCK"].includes(action),
      reason: `LAB active defense: ${action} on ${context.family}`,
      auditId: `def_${action}_${Date.now()}`,
      expiresAt: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null,
    };
    this.actionLog.push(result);
    return result;
  }

  selectAction(family: string, severity: string, frequency: number): CyberDefenseAction {
    if (family.includes("INJECTION") || family.includes("CRYPTO")) return "PAYLOAD_REJECTION";
    if (family.includes("AUTH") && frequency >= 10) return "RATE_LIMIT";
    if (family.includes("AUTHZ") || severity === "CRITICAL") return "REJECT";
    if (family.includes("SESSION")) return "SESSION_INVALIDATION";
    if (family.includes("SYNC") || family.includes("RATE")) return "REPLAY_REJECTION";
    if (frequency >= 50) return "TEMPORARY_BLOCK";
    return "BACKOFF";
  }

  getLog(): ActiveDefenseResult[] {
    return [...this.actionLog];
  }

  reset(): void {
    this.actionLog = [];
  }
}
