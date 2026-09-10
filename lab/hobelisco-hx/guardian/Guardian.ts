/** Guardião do guardião — validação independente */

import type { GuardianResult, SensorSignal } from "../types";
import { HOBELISCO_INVARIANTS } from "../dna/invariants";

export function runGuardianCycle(input: {
  beforeHealth: number;
  afterHealth: number;
  sensors: SensorSignal[];
  repairAttempted: boolean;
  repairSucceeded: boolean;
  /** Reparou com success=true mas sistema ainda inválido */
  systemInvalidAfterRepair?: boolean;
}): GuardianResult {
  const details: string[] = ["before", "repair", "validate", "health check", "invariant check", "compare"];

  const critSensors = input.sensors.filter((s) => s.level === "CRIT");
  const invariantsOk = HOBELISCO_INVARIANTS.length >= 9;

  if (input.repairAttempted && input.repairSucceeded && input.systemInvalidAfterRepair) {
    return {
      ok: false,
      stage: "FALSE_SUCCESS",
      rollback: true,
      humanRequired: true,
      details: [...details, "FALSE SUCCESS detected → rollback"],
    };
  }

  if (input.repairAttempted && !input.repairSucceeded) {
    return {
      ok: false,
      stage: "repair",
      rollback: true,
      humanRequired: true,
      details: [...details, "repair failed → rollback"],
    };
  }

  if (!invariantsOk) {
    return {
      ok: false,
      stage: "invariant check",
      rollback: true,
      humanRequired: true,
      details: [...details, "invariant missing"],
    };
  }

  if (input.afterHealth < input.beforeHealth - 5) {
    return {
      ok: false,
      stage: "health check",
      rollback: true,
      humanRequired: true,
      details: [...details, `health dropped ${input.beforeHealth} → ${input.afterHealth}`],
    };
  }

  if (critSensors.length > 0 && input.repairAttempted) {
    return {
      ok: false,
      stage: "validate",
      rollback: true,
      humanRequired: true,
      details: [...details, `${critSensors.length} sensor(es) CRIT`],
    };
  }

  return {
    ok: true,
    stage: "success",
    rollback: false,
    humanRequired: false,
    details: [...details, "success"],
  };
}
