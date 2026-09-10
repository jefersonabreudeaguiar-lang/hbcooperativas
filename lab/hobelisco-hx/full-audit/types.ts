export type OrganismTestSeverity = "critical" | "high" | "medium" | "low";
export type OrganismTestStatus = "PASS" | "FAIL" | "NOT_EXECUTED" | "GAP";

export interface OrganismTestResult {
  id: string;
  name: string;
  severity: OrganismTestSeverity;
  status: OrganismTestStatus;
  detail: string;
}

export type OrganismVerdict = "ORGANISM-GREEN" | "ORGANISM-AMBER" | "ORGANISM-RED";

export interface FullOrganismAuditReport {
  generatedAt: string;
  version: string;
  organismId: string;
  vitalState: string;
  health: number;
  generation: number;
  dna: string;
  organismVerdict: OrganismVerdict;
  organismReadinessScore: number;
  tests: OrganismTestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  lifeAuditRegression: { passed: number; total: number; ok: boolean };
  arenaRegression: { scenariosPassed: number; scenariosRun: number; ok: boolean };
  fullCoreSimulations: {
    total: number;
    passed: number;
    survivalRate: number;
    notExecuted10000: boolean;
  };
  boundaries: { violations: number; financialViolations: number; productionBlocked: boolean };
  metrics: Record<string, number>;
  deaths: number;
  reincarnations: number;
  antibodies: number;
  gaps: string[];
  limitations: string[];
  performance: Record<string, number>;
}

export function recordOrganismTest(
  tests: OrganismTestResult[],
  input: { id: string; name: string; severity: OrganismTestSeverity; pass: boolean; detail: string; notExecuted?: boolean; gap?: boolean }
): void {
  let status: OrganismTestStatus = input.pass ? "PASS" : "FAIL";
  if (input.notExecuted) status = "NOT_EXECUTED";
  else if (input.gap) status = "GAP";
  tests.push({ id: input.id, name: input.name, severity: input.severity, status, detail: input.detail });
}
