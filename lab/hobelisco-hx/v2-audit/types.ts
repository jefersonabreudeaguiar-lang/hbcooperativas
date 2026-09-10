export type V2TestStatus = "PASS" | "FAIL" | "GAP" | "NOT_EXECUTED" | "NOT_VALIDATED";

export interface V2TestResult {
  id: string;
  phase: number;
  name: string;
  severity: "critical" | "high" | "medium";
  pass: boolean;
  detail: string;
  status: V2TestStatus;
}

export interface V2StagingAuditReport {
  generatedAt: string;
  version: string;
  v2Version: string;
  environment: string;
  stagingConnection: "OK" | "NOT_CONFIGURED" | "NOT_VALIDATED";
  verdict: "V2-GREEN" | "V2-AMBER" | "V2-RED";
  observationReadiness: {
    overall: number;
    dimensions: Record<string, number>;
  };
  tests: V2TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  notValidated: number;
  v1Regression: {
    lifeAudit: { pass: number; total: number; ok: boolean };
    arena: { pass: number; total: number; ok: boolean };
    ok: boolean;
  };
  metrics: Record<string, number>;
  filesAnalyzed: string[];
  filesCreated: string[];
  filesModified: string[];
  limitations: string[];
  risks: string[];
  certificatePath: string;
}

export function recordV2Test(tests: V2TestResult[], t: Omit<V2TestResult, "status"> & { notValidated?: boolean }): void {
  tests.push({
    ...t,
    status: t.notValidated ? "NOT_VALIDATED" : t.pass ? "PASS" : "FAIL",
  });
}
