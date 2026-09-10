/** GuardianValidator — BEFORE → ACTION → AFTER → VALIDATE */

import type { GuardianResult, SensorSignal } from "../types";
import { runGuardianCycle } from "./Guardian";

export interface GuardianValidationInput {
  beforeHealth: number;
  afterHealth: number;
  sensors: SensorSignal[];
  repairAttempted: boolean;
  repairSucceeded: boolean;
  systemInvalidAfterRepair?: boolean;
  expectedStateValid?: boolean;
}

export interface GuardianValidationResult extends GuardianResult {
  falseSuccess: boolean;
  rollbackRequired: boolean;
}

export function validateRemediation(input: GuardianValidationInput): GuardianValidationResult {
  const result = runGuardianCycle({
    beforeHealth: input.beforeHealth,
    afterHealth: input.afterHealth,
    sensors: input.sensors,
    repairAttempted: input.repairAttempted,
    repairSucceeded: input.repairSucceeded,
    systemInvalidAfterRepair: input.systemInvalidAfterRepair,
  });

  const falseSuccess =
    result.stage === "FALSE_SUCCESS" ||
    (input.repairAttempted && input.repairSucceeded && input.systemInvalidAfterRepair) ||
    (input.repairAttempted && input.repairSucceeded && !result.ok);

  return {
    ...result,
    falseSuccess,
    rollbackRequired: falseSuccess || result.rollback,
  };
}

/** 5 cenários explícitos de falso sucesso */
export const FALSE_SUCCESS_SCENARIOS: Array<{
  id: string;
  input: GuardianValidationInput;
  expectFalseSuccess: boolean;
}> = [
  {
    id: "GS-001-repair-ok-state-bad",
    input: { beforeHealth: 80, afterHealth: 90, sensors: [], repairAttempted: true, repairSucceeded: true, systemInvalidAfterRepair: true },
    expectFalseSuccess: true,
  },
  {
    id: "GS-002-health-drop",
    input: { beforeHealth: 90, afterHealth: 50, sensors: [], repairAttempted: true, repairSucceeded: true },
    expectFalseSuccess: true,
  },
  {
    id: "GS-003-crit-sensors-post-repair",
    input: {
      beforeHealth: 80,
      afterHealth: 85,
      sensors: [{ sensor: "AUTH", level: "CRIT", message: "fail", observedAt: new Date().toISOString() }],
      repairAttempted: true,
      repairSucceeded: true,
    },
    expectFalseSuccess: true,
  },
  {
    id: "GS-004-repair-failed",
    input: { beforeHealth: 80, afterHealth: 80, sensors: [], repairAttempted: true, repairSucceeded: false },
    expectFalseSuccess: false,
  },
  {
    id: "GS-005-genuine-success",
    input: { beforeHealth: 80, afterHealth: 85, sensors: [], repairAttempted: true, repairSucceeded: true },
    expectFalseSuccess: false,
  },
];

export function runFalseSuccessBattery(): { passed: number; total: number; results: Array<{ id: string; ok: boolean }> } {
  const results = FALSE_SUCCESS_SCENARIOS.map((s) => {
    const v = validateRemediation(s.input);
    const ok = v.falseSuccess === s.expectFalseSuccess;
    return { id: s.id, ok };
  });
  return { passed: results.filter((r) => r.ok).length, total: results.length, results };
}
