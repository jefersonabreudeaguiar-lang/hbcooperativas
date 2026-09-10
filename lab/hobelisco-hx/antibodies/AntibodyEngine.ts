/** Antibody Engine — lifecycle CANDIDATE → VALIDATED (LAB only) */

import { registerAntibody, listAntibodies } from "./AntibodyRegistry";
import type { DefenseAntibody } from "../types";

export type AntibodyStatus = "CANDIDATE" | "TESTING" | "VALIDATED" | "ACTIVE" | "RETIRED" | "FAILED";

export interface AntibodyRecord extends DefenseAntibody {
  status: AntibodyStatus;
  threatDna: string;
  confidence: number;
  efficacy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  createdAt: string;
  lineage: string;
  parentRule: string;
  sourceIncident: string;
}

const ENGINE: AntibodyRecord[] = [];

export function createAntibodyCandidate(input: {
  incidentId: string;
  ruleId: string;
  threatDna: string;
  name: string;
}): AntibodyRecord | { blocked: true; reason: string } {
  if (!input.incidentId || !input.ruleId) {
    return { blocked: true, reason: "ANTIBODY_REQUIRES_ORIGIN" };
  }
  const base = registerAntibody(input.incidentId, input.name, input.ruleId);
  const record: AntibodyRecord = {
    ...base,
    status: "CANDIDATE",
    threatDna: input.threatDna,
    confidence: 50,
    efficacy: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    createdAt: new Date().toISOString(),
    lineage: `INCIDENT:${input.incidentId}→RULE:${input.ruleId}`,
    parentRule: input.ruleId,
    sourceIncident: input.incidentId,
  };
  ENGINE.push(record);
  return record;
}

export function promoteAntibody(
  antibodyId: string,
  arenaResults: { passed: number; total: number; falsePositives: number; falseNegatives: number }
): AntibodyRecord | undefined {
  const ab = ENGINE.find((a) => a.id === antibodyId);
  if (!ab || ab.status === "CANDIDATE") {
    if (ab) ab.status = "TESTING";
  }
  const target = ENGINE.find((a) => a.id === antibodyId);
  if (!target) return undefined;

  target.efficacy = arenaResults.total ? Math.round((arenaResults.passed / arenaResults.total) * 100) : 0;
  target.falsePositiveRate = arenaResults.total ? Math.round((arenaResults.falsePositives / arenaResults.total) * 100) : 0;
  target.falseNegativeRate = arenaResults.total ? Math.round((arenaResults.falseNegatives / arenaResults.total) * 100) : 0;
  target.confidence = target.efficacy;

  if (target.efficacy >= 70 && target.falsePositiveRate < 15) {
    target.status = "VALIDATED";
  } else if (target.efficacy < 40) {
    target.status = "FAILED";
  }
  return target;
}

export function listAntibodyRecords(): AntibodyRecord[] {
  return [...ENGINE, ...listAntibodies().map((a) => ({
    ...a,
    status: "ACTIVE" as AntibodyStatus,
    threatDna: a.bornFrom,
    confidence: 85,
    efficacy: 85,
    falsePositiveRate: 5,
    falseNegativeRate: 5,
    createdAt: new Date().toISOString(),
    lineage: a.bornFrom,
    parentRule: a.ruleId ?? "unknown",
    sourceIncident: a.bornFrom,
  }))];
}

export function validatedAntibodies(): AntibodyRecord[] {
  return listAntibodyRecords().filter((a) => a.status === "VALIDATED" || a.status === "ACTIVE");
}
