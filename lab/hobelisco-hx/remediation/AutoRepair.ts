/** Auto Repair — apenas estados reversíveis */

import type { AutoRepairResult } from "../types";
import { evaluateFinancialAction } from "../financial/FinancialGuard";

const ALLOWED_REPAIRS = new Set([
  "CLEAR_CACHE",
  "REBUILD_LOCAL_INDEX",
  "RESTART_SYNC_QUEUE",
  "REFRESH_SERVICE_WORKER",
  "REBUILD_LOCAL_STATE",
]);

const FORBIDDEN_REPAIRS = [
  "ALTER_LEDGER",
  "ALTER_BALANCE",
  "ALTER_CREDIT",
  "ALTER_RLS",
  "RUN_MIGRATION",
  "DELETE_HISTORY",
  "CREATE_ADMIN",
];

export function attemptAutoRepair(action: string): AutoRepairResult {
  const upper = action.toUpperCase();

  for (const forbidden of FORBIDDEN_REPAIRS) {
    if (upper.includes(forbidden)) {
      const fin = evaluateFinancialAction({ action: upper, target: "auto_repair" });
      return {
        allowed: false,
        action,
        rolledBack: true,
        humanRequired: true,
        message: fin.allowed === false ? fin.reason : `Reparo proibido: ${forbidden}`,
      };
    }
  }

  if (!ALLOWED_REPAIRS.has(upper)) {
    return {
      allowed: false,
      action,
      rolledBack: false,
      humanRequired: true,
      message: `Reparo não catalogado como reversível: ${action}`,
    };
  }

  return {
    allowed: true,
    action,
    rolledBack: false,
    humanRequired: false,
    message: `Reparo reversível simulado: ${action}`,
  };
}

export function listAllowedRepairs(): string[] {
  return [...ALLOWED_REPAIRS];
}
