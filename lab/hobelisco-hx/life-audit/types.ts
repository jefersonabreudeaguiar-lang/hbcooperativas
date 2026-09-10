export type TestSeverity = "critical" | "high" | "medium" | "low";

export type TestStatus = "PASS" | "FAIL" | "NOT_EXECUTED" | "GAP";

export interface LifeTestResult {
  id: string;
  phase: number;
  name: string;
  severity: TestSeverity;
  status: TestStatus;
  detail: string;
}

export interface LifeAuditReport {
  generatedAt: string;
  version: string;
  boundaryOk: boolean;
  boundaryViolations: string[];
  tests: LifeTestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  gaps: number;
  notExecuted: number;
  scenarios: number;
  microSimulations: number;
  vitality: import("./vitalityScore").VitalityReport;
  lifeVerdict: import("./vitalityScore").LifeVerdict;
  defenseComparison?: {
    defenseA: string;
    defenseB: string;
    survivalA: number;
    survivalB: number;
    winner: string;
    reason: string;
  };
  metrics: {
    survivalRate?: number;
    failureRate?: number;
    falsePositiveRate?: number;
    falseNegativeRate?: number;
    containmentRate?: number;
    recoveryRate?: number;
  };
  filesAnalyzed: string[];
  filesModified: string[];
  correctionsApplied: string[];
  correctionsNotApplied: string[];
  gapsDocumented: string[];
}

export function recordTest(
  tests: LifeTestResult[],
  input: Omit<LifeTestResult, "status"> & { pass: boolean; gap?: boolean; notExecuted?: boolean }
): void {
  let status: TestStatus = input.pass ? "PASS" : "FAIL";
  if (input.notExecuted) status = "NOT_EXECUTED";
  else if (input.gap) status = "GAP";
  tests.push({ ...input, status });
}
