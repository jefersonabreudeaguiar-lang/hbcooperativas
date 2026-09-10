export type ClosureTestStatus = "PASS" | "FAIL" | "NOT_EXECUTED" | "GAP";

export interface ClosureTestResult {
  id: string;
  phase: number;
  category: string;
  name: string;
  status: ClosureTestStatus;
  detail: string;
}

export type ClosureVerdict = "ORGANISM-GREEN" | "ORGANISM-AMBER" | "ORGANISM-RED";

export interface ClosureAuditReport {
  generatedAt: string;
  version: string;
  gitCommit: string | null;
  organismVerdict: ClosureVerdict;
  organismId: string;
  lifeState: string;
  vitality: number;
  immunityReadiness: { score: number; classification: string };
  tests: ClosureTestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  arena: { scenarios: number; passed: number; microSims: number; microPassed: number; fullCore: number; fullCorePassed: number; notExecuted10000: boolean };
  attacks: { total: number; passed: number };
  lifeCycle: { pass: boolean; detail: string };
  memory: { pass: boolean };
  threatDNA: { pass: boolean };
  antibodies: { pass: boolean };
  evolution: { pass: boolean };
  guardian: { pass: boolean; falseSuccessScenarios: number };
  circuitBreaker: { pass: boolean };
  financialBoundary: { pass: boolean; blocked: number };
  cooperativeIsolation: { pass: boolean };
  replay: { pass: boolean };
  snapshot: { pass: boolean };
  deathReincarnation: { pass: boolean };
  hibernation: { pass: boolean };
  organRestart: { pass: boolean };
  redTeam: { pass: boolean };
  loopGuard: { pass: boolean };
  securityScan: { pass: boolean };
  productionBoundary: { violations: number };
  performance: Record<string, number>;
  v1Regression: { life: string; arena: string };
  remainingGaps: string[];
  filesChanged: string[];
}

export function recordClosureTest(
  tests: ClosureTestResult[],
  input: { id: string; phase: number; category: string; name: string; pass: boolean; detail: string; notExecuted?: boolean }
): void {
  let status: ClosureTestStatus = input.pass ? "PASS" : "FAIL";
  if (input.notExecuted) status = "NOT_EXECUTED";
  tests.push({ id: input.id, phase: input.phase, category: input.category, name: input.name, status, detail: input.detail });
}
