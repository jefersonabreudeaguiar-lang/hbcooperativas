/** Boot real do organismo — verifica dependências críticas */

import type { AuditChain } from "../audit/AuditChain";
import { HOBELISCO_INVARIANTS } from "../dna/invariants";
import { getLatestDefenseDna } from "../dna/DefenseDNA";
import { resolveHobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { LabBoundary } from "../lab-world/LabBoundary";
import { getLabWorld } from "../lab-world/LabWorld";
import { nowIso } from "../lab-world/LabClock";
import { assertCooperativeScope } from "../security/cooperativeIsolation";
import { runAllSensors } from "../sensors/index";
import type { HobeliscoCore } from "../core/HobeliscoCore";
import { updateOrganismIdentity } from "./OrganismIdentity";

export interface BootCheck {
  name: string;
  ok: boolean;
  severity: "critical" | "warning";
  detail: string;
}

export interface BootReport {
  success: boolean;
  checks: BootCheck[];
  failures: BootCheck[];
  warnings: BootCheck[];
  timestamp: string;
  safeMode: boolean;
}

export function runHobeliscoBootSequence(core: HobeliscoCore, env: NodeJS.ProcessEnv = process.env): BootReport {
  const checks: BootCheck[] = [];
  const boundary = new LabBoundary(core.audit);

  const push = (name: string, ok: boolean, severity: BootCheck["severity"], detail: string) => {
    checks.push({ name, ok, severity, detail });
  };

  const environment = resolveHobeliscoEnvironment(env);
  push("ENVIRONMENT", environment === "LAB", "critical", `environment=${environment}`);
  if (environment !== "LAB") {
    boundary.check("PRODUCTION");
  }

  const dna = getLatestDefenseDna();
  push("DNA", dna.version.startsWith("DNA-"), "critical", `dna=${dna.version}`);

  push("INVARIANTS", HOBELISCO_INVARIANTS.length >= 5, "critical", `${HOBELISCO_INVARIANTS.length} invariants`);

  const sensors = runAllSensors({});
  push("SENSORS", sensors.length >= 10, "critical", `${sensors.length} sensors`);

  push("MEMORY", core.memory.stats().short >= 0, "critical", "memory store reachable");

  const auditOk = core.audit.verify().ok;
  push("AUDIT", auditOk, "critical", auditOk ? "chain valid" : "chain invalid");

  const finBlock = evaluateFinancialAction({ action: "CREATE_CREDIT", target: "boot-probe" });
  push("FINANCIAL_GUARD", !finBlock.allowed, "critical", finBlock.allowed ? "FAIL OPEN" : "blocked as expected");

  const iso = assertCooperativeScope("62351750000165", "11111111000111");
  push("COOPERATIVE_ISOLATION", !iso.ok, "critical", iso.ok ? "isolation ok" : iso.reason);

  const world = getLabWorld();
  push("LAB_WORLD", world.cooperatives.length >= 3, "warning", `${world.cooperatives.length} cooperatives`);

  push("PERSISTENCE", Boolean(core.persistence), "warning", "lab persistence attached");

  const prodBlock = boundary.check("PROD_DATABASE");
  push("LAB_BOUNDARY", prodBlock.blocked, "critical", prodBlock.blocked ? "PROD blocked" : "FAIL OPEN");

  const failures = checks.filter((c) => !c.ok && c.severity === "critical");
  const warnings = checks.filter((c) => !c.ok && c.severity === "warning");
  const safeMode = failures.length > 0;

  if (safeMode) {
    core.stateMachine.force("SAFE_MODE");
    updateOrganismIdentity({ vitalState: "SAFE_MODE", health: Math.min(50, core.snapshot().health.overall) });
  } else {
    try {
      core.stateMachine.bootSequence();
      updateOrganismIdentity({
        vitalState: core.stateMachine.current,
        health: core.snapshot().health.overall,
        dnaId: dna.version,
      });
    } catch {
      core.stateMachine.force("SAFE_MODE");
    }
  }

  core.audit.append("BOOT_REPORT", {
    success: !safeMode,
    failures: failures.map((f) => f.name),
    warnings: warnings.map((w) => w.name),
  });

  return {
    success: !safeMode,
    checks,
    failures,
    warnings,
    timestamp: nowIso(),
    safeMode,
  };
}
