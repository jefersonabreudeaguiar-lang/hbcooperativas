/** Sistema imunológico — PREVENT → CONTAIN → REPAIR → VALIDATE */

import type { ImmuneAction, ThreatFingerprint } from "../types";
import { evaluateFinancialAction } from "../financial/FinancialGuard";

export class ImmuneSystem {
  private log: ImmuneAction[] = [];

  get recent(): ImmuneAction[] {
    return this.log.slice(-10);
  }

  respond(threat: ThreatFingerprint): ImmuneAction[] {
    const actions: ImmuneAction[] = [];
    const now = new Date().toISOString();

    actions.push({
      phase: "PREVENT",
      action: `Pattern watch: ${threat.sequence.join(",")}`,
      approved: true,
      requiresHuman: false,
      at: now,
    });

    if (threat.severity === "high" || threat.severity === "critical") {
      actions.push({
        phase: "CONTAIN",
        action: "Rate limit + Fortress elevate (simulado)",
        approved: true,
        requiresHuman: threat.severity === "critical",
        at: now,
      });
    }

    if (threat.sequence.includes("alter_ledger")) {
      const verdict = evaluateFinancialAction({
        action: "ALTER_LEDGER",
        target: threat.endpoint ?? "unknown",
      });
      actions.push({
        phase: "REPAIR",
        action: "Tentativa reparo financeiro bloqueada",
        approved: false,
        requiresHuman: verdict.allowed === false ? verdict.humanRequired : false,
        at: now,
      });
    }

    actions.push({
      phase: "VALIDATE",
      action: "Aguardando Guardian — nenhuma defesa autoaprovada",
      approved: false,
      requiresHuman: true,
      at: now,
    });

    this.log.push(...actions);
    return actions;
  }
}
