import type { ScenarioExecutionResult, ScenarioOutcome, ThreatFamilyId } from "./types";

export interface ThreatMemoryEntry {
  fingerprint: string;
  attackFamily: ThreatFamilyId;
  observedBehavior: string;
  defenseResult: ScenarioOutcome;
  outcome: ScenarioOutcome;
  policyVersion: string;
  recordedAt: string;
}

export class ThreatMemory {
  private entries: ThreatMemoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 50_000) {
    this.maxEntries = maxEntries;
  }

  record(input: {
    scenarioId: string;
    family: ThreatFamilyId;
    sequence: string[];
    result: ScenarioExecutionResult;
  }): ThreatMemoryEntry {
    const fingerprint = `fp_${input.family}_${input.sequence.join("_")}_${input.scenarioId}`;
    const entry: ThreatMemoryEntry = {
      fingerprint,
      attackFamily: input.family,
      observedBehavior: input.sequence.join(" → "),
      defenseResult: input.result.outcome,
      outcome: input.result.outcome,
      policyVersion: input.result.policyVersion,
      recordedAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    return entry;
  }

  queryByFamily(family: ThreatFamilyId): ThreatMemoryEntry[] {
    return this.entries.filter((e) => e.attackFamily === family);
  }

  queryMissed(): ThreatMemoryEntry[] {
    return this.entries.filter((e) => e.outcome === "MISSED");
  }

  size(): number {
    return this.entries.length;
  }

  reset(): void {
    this.entries = [];
  }
}

let shared: ThreatMemory | null = null;

export function getThreatMemory(): ThreatMemory {
  if (!shared) shared = new ThreatMemory();
  return shared;
}
