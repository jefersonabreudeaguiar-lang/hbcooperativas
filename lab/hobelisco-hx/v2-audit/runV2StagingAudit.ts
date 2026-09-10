import { mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { HOBELISCO_V2_VERSION } from "../config";
import { resolveHobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import { computeObservationReadiness, computeV2Verdict } from "../observer/ObservationReadiness";
import { isStagingPersistenceConfigured, STAGING_CONNECTION_NOT_CONFIGURED } from "../persistence/SupabaseStagingPersistence";
import { runLifeAudit } from "../life-audit/runLifeAudit";
import { runArenaSimulation } from "../arena/SimulationRunner";
import { checkV2Boundary } from "./boundaryCheck";
import { formatV2AuditMarkdown, formatV2AuditText } from "./reportFormatter";
import { runAllV2Phases } from "./phases";
import { recordV2Test, type V2StagingAuditReport } from "./types";

const FILES_CREATED = [
  "lab/hobelisco-hx/environment/HobeliscoEnvironment.ts",
  "lab/hobelisco-hx/observation/",
  "lab/hobelisco-hx/persistence/HobeliscoPersistence.ts",
  "lab/hobelisco-hx/persistence/InMemoryPersistence.ts",
  "lab/hobelisco-hx/persistence/SupabaseStagingPersistence.ts",
  "lab/hobelisco-hx/observer/",
  "lab/hobelisco-hx/v2-audit/",
  "lab/hobelisco-hx/schema/hb_hobelisco_v2_staging.sql",
  "src/lib/lab/hobeliscoV2Gate.ts",
  "src/lib/lab/hobeliscoObservationBridge.ts",
  "scripts/lab/run-hobelisco-v2-staging-audit.ts",
  "docs/HOBELISCO-V2-CODE-MAP.md",
  "docs/HOBELISCO-V2-OBSERVE-ONLY.md",
  "docs/HOBELISCO-V2-STAGING-MIGRATION.md",
  "docs/HOBELISCO-V2-STAGING-RUNBOOK.md",
];

const FILES_MODIFIED = ["lab/hobelisco-hx/config.ts", "package.json"];

function listAnalyzedFiles(): string[] {
  const root = join(process.cwd(), "lab", "hobelisco-hx");
  const out: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "reports" || name === "node_modules") continue;
        walk(p);
      } else if (/\.(ts|tsx|md|sql|json)$/.test(name)) {
        out.push(p.replace(process.cwd(), "").replace(/\\/g, "/"));
      }
    }
  }
  walk(root);
  return out.sort();
}

export async function runV2StagingAudit(): Promise<V2StagingAuditReport> {
  const boundary = checkV2Boundary();
  if (!boundary.ok) {
    throw new Error(`HOBELISCO_V2_BOUNDARY_VIOLATION: ${boundary.violations.join(", ")}`);
  }

  const tests: V2StagingAuditReport["tests"] = [];
  const phaseResult = await runAllV2Phases(tests);

  let lifeOk = false;
  let lifePass = 0;
  let lifeTotal = 27;
  let arenaOk = false;
  let arenaPass = 0;
  let arenaTotal = 30;

  try {
    const life = runLifeAudit();
    lifePass = life.passed;
    lifeTotal = life.totalTests;
    lifeOk = life.failed === 0 && life.lifeVerdict !== "LIFE-RED";
  } catch {
    lifeOk = false;
  }

  try {
    const arena = runArenaSimulation();
    arenaPass = arena.mandatoryTests.filter((t) => t.pass).length;
    arenaTotal = arena.mandatoryTests.length;
    arenaOk = arena.allMandatoryPassed && arena.scenariosPassed === arena.scenariosRun;
  } catch {
    arenaOk = false;
  }

  recordV2Regression(tests, lifeOk, arenaOk);

  const passed = tests.filter((t) => t.status === "PASS").length;
  const failed = tests.filter((t) => t.status === "FAIL").length;
  const notValidated = tests.filter((t) => t.status === "NOT_VALIDATED").length;
  const criticalFailed = tests.filter((t) => t.status === "FAIL" && t.severity === "critical").length;

  const stagingConfigured = isStagingPersistenceConfigured();
  const readiness = computeObservationReadiness({
    sensorCount: 10,
    persistenceConfigured: stagingConfigured,
    persistenceMode: stagingConfigured ? "supabase_staging" : "memory",
    metrics: phaseResult.metrics,
    selfWatchOk: tests.find((t) => t.id === "V2-SELF-WATCH-001")?.status === "PASS",
    v1RegressionPass: lifeOk && arenaOk,
  });

  const productionTripwirePass = tests.find((t) => t.id === "V2-PRODUCTION-TRIPWIRE-001")?.status === "PASS";

  const verdict = computeV2Verdict({
    testsFailed: failed,
    criticalFailed,
    v1RegressionPass: lifeOk && arenaOk,
    productionTripwirePass: productionTripwirePass ?? false,
    financialMutationCount: phaseResult.financialMutations,
    secretPersisted: phaseResult.secretPersisted,
    cooperativeLeak: phaseResult.cooperativeLeak,
  });

  const certificate = {
    version: HOBELISCO_V2_VERSION,
    environment: resolveHobeliscoEnvironment(),
    observeOnly: true,
    mutationAllowed: false,
    productionAllowed: false,
    financialMutationAllowed: false,
    cooperativeIsolation: tests.filter((t) => t.id.startsWith("V2-COOP")).every((t) => t.status === "PASS"),
    persistence: stagingConfigured ? "CONFIGURED" : STAGING_CONNECTION_NOT_CONFIGURED,
    audit: tests.find((t) => t.id === "V2-AUDIT-CHAIN-1000")?.status === "PASS",
    tests: { passed, failed, total: tests.length },
    timestamp: new Date().toISOString(),
  };

  const certPath = join(process.cwd(), "lab", "hobelisco-hx", "reports", "HOBELISCO_V2_OBSERVE_ONLY_CERTIFICATE.json");
  mkdirSync(join(process.cwd(), "lab", "hobelisco-hx", "reports"), { recursive: true });
  writeFileSync(certPath, JSON.stringify(certificate, null, 2), "utf8");

  return {
    generatedAt: new Date().toISOString(),
    version: HOBELISCO_V2_VERSION,
    v2Version: HOBELISCO_V2_VERSION,
    environment: resolveHobeliscoEnvironment(),
    stagingConnection: stagingConfigured ? "OK" : "NOT_CONFIGURED",
    verdict,
    observationReadiness: readiness,
    tests,
    totalTests: tests.length,
    passed,
    failed,
    notValidated,
    v1Regression: {
      lifeAudit: { pass: lifePass, total: lifeTotal, ok: lifeOk },
      arena: { pass: arenaPass, total: arenaTotal, ok: arenaOk },
      ok: lifeOk && arenaOk,
    },
    metrics: {
      ...phaseResult.metrics,
      testsPassed: passed,
      testsFailed: failed,
      auditIntegrity: tests.find((t) => t.id === "V2-AUDIT-CHAIN-1000")?.status === "PASS" ? 1 : 0,
    },
    filesAnalyzed: listAnalyzedFiles(),
    filesCreated: FILES_CREATED,
    filesModified: FILES_MODIFIED,
    limitations: [
      stagingConfigured ? "" : STAGING_CONNECTION_NOT_CONFIGURED,
      "Supabase write path preparado — persistência real requer credenciais staging",
      "Bridge API/auth em src/lib/lab — integração middleware opcional",
      "Arena V1 intacta — adapter sintético apenas",
    ].filter(Boolean),
    risks: [
      "Flags mal configuradas em staging preview",
      "Migration manual necessária antes de persistência nuvem",
    ],
    certificatePath: certPath.replace(process.cwd(), "").replace(/\\/g, "/"),
  };
}

function recordV2Regression(tests: V2StagingAuditReport["tests"], lifeOk: boolean, arenaOk: boolean): void {
  recordV2Test(tests, {
    id: "V2-REGRESSION-LIFE",
    phase: 44,
    name: "Regressão Life Audit V1",
    severity: "critical",
    pass: lifeOk,
    detail: lifeOk ? "27/27" : "BASELINE_V1_FAILURE",
  });
  recordV2Test(tests, {
    id: "V2-REGRESSION-ARENA",
    phase: 44,
    name: "Regressão Arena V1",
    severity: "critical",
    pass: arenaOk,
    detail: arenaOk ? "30/30" : "BASELINE_V1_FAILURE",
  });
}
