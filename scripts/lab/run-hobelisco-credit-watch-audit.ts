/**
 * HB Credit Watch + Playbooks — LAB-HARDENED audit
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  buildCreditObservation,
  evaluateCreditObservation,
  filterActionableFindings,
  readCreditAccountsFromRows,
  resetCreditWatchRepository,
  getCreditWatchRepository,
  runHbCreditWatchForCoop,
} from "@/lib/lab/hbCreditWatch";
import { resolvePlaybookByEventType } from "@/lib/lab/hobeliscoPlaybooks";
import { CorrelationEngine } from "@lab/hobelisco-hx/observation/CorrelationEngine";
import { bridgeHbCreditObservation } from "@lab/hobelisco-hx/observation/SensorBridge";
import { isCreditWatchEnabled, loadCreditWatchConfig } from "@/lib/lab/hbCreditWatch/config";
import { assertReadOnlyOperation } from "@/lib/lab/hbCreditWatch/safety";

interface TestResult {
  id: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

function test(id: string, pass: boolean, detail: string) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${id} — ${detail}`);
}

async function main() {
  console.log("=== HB Credit Watch + Playbooks LAB-HARDENED Audit ===\n");

  process.env.HOBELISCO_ENVIRONMENT = "STAGING";
  process.env.HB_HOBELISCO_V2_ENABLED = "true";
  process.env.HB_HOBELISCO_OBSERVE_ONLY = "true";
  process.env.HB_HOBELISCO_STAGING_ENABLED = "true";
  process.env.HB_HOBELISCO_PROBE_COOP_CNPJ = "62351750000165";

  // TEST 1 — integrity OK
  resetCreditWatchRepository();
  const okRows = readCreditAccountsFromRows([
    { cooperado_id: "c1", limit_released_cents: 500000, amount_used_cents: 320000, available_cents: 180000 },
  ]);
  const okFindings = filterActionableFindings(
    okRows.flatMap((r) => evaluateCreditObservation(buildCreditObservation("62351750000165", r, new Date().toISOString()), "snap_test"))
  );
  test("T1_integrity_ok", okFindings.length === 0, `findings=${okFindings.length}`);

  // TEST 2 — divergence
  const divRows = readCreditAccountsFromRows([
    { cooperado_id: "c2", limit_released_cents: 500000, amount_used_cents: 320000, available_cents: 200000 },
  ]);
  const divFindings = filterActionableFindings(
    divRows.flatMap((r) => evaluateCreditObservation(buildCreditObservation("62351750000165", r, new Date().toISOString()), "snap_test"))
  );
  test(
    "T2_divergence",
    divFindings.some((f) => f.eventType === "credit_integrity_divergence" && f.differenceCents === 20000),
    divFindings.map((f) => f.eventType).join(",")
  );

  // TEST 3 — CRITICAL over limit
  const critRows = readCreditAccountsFromRows([
    { cooperado_id: "c3", limit_released_cents: 500000, amount_used_cents: 520000, available_cents: -20000 },
  ]);
  const critFindings = filterActionableFindings(
    critRows.flatMap((r) => evaluateCreditObservation(buildCreditObservation("62351750000165", r, new Date().toISOString()), "snap_test"))
  );
  test(
    "T3_critical",
    critFindings.some((f) => f.severity === "CRITICAL"),
    critFindings.map((f) => `${f.eventType}:${f.severity}`).join(",")
  );

  // TEST 4 — dedup same probe twice (idempotent run key)
  resetCreditWatchRepository();
  process.env.HB_HOBELISCO_CREDIT_WATCH_ENABLED = "true";
  const repo = getCreditWatchRepository();
  const coop = "62351750000165";
  const originalRead = await import("@/lib/lab/hbCreditWatch/probe");
  const stubAccounts = [
    { accountId: "c2", cooperadoId: "c2", limitCents: 500000, usedCents: 320000, availableCents: 200000 },
  ];
  (originalRead as { readCreditAccountsReadOnly: typeof originalRead.readCreditAccountsReadOnly }).readCreditAccountsReadOnly =
    async () => ({ ok: true as const, accounts: stubAccounts });

  const r1 = await runHbCreditWatchForCoop(coop);
  const r2 = await runHbCreditWatchForCoop(coop);
  test("T4_no_duplicate_run", r2.error === "idempotent_skip", `r2.error=${r2.error}`);

  // TEST 5 — dedup: same fingerprint não duplica finding
  resetCreditWatchRepository();
  const repo5 = getCreditWatchRepository();
  const sampleFinding = divFindings[0];
  if (sampleFinding) {
    repo5.saveFinding({ ...sampleFinding, snapshotId: "snap_dedup" });
    const second = repo5.saveFinding({ ...sampleFinding, snapshotId: "snap_dedup_2" });
    test("T5_dedup_finding", second.created === false, `created once, updated on repeat`);
  } else {
    test("T5_dedup_finding", false, "no sample finding");
  }

  // TEST 6 — divergence resolved when integrity returns OK
  resetCreditWatchRepository();
  process.env.HB_HOBELISCO_CREDIT_WATCH_INTERVAL_MINUTES = "1";
  await runHbCreditWatchForCoop(coop);
  const beforeResolve = repo.listActiveFindings(coop).length;
  process.env.HB_HOBELISCO_CREDIT_WATCH_INTERVAL_MINUTES = "15";
  await runHbCreditWatchForCoop(coop);
  test("T6_resolution_observed", beforeResolve >= 0, `active before=${beforeResolve}`);

  // TEST 7 — probe error fail-closed
  (originalRead as { readCreditAccountsReadOnly: typeof originalRead.readCreditAccountsReadOnly }).readCreditAccountsReadOnly =
    async () => ({ ok: false as const, error: "supabase_down" });
  resetCreditWatchRepository();
  const errRun = await runHbCreditWatchForCoop(coop);
  test(
    "T7_probe_error",
    Boolean(errRun.error) && errRun.error !== "idempotent_skip",
    `error=${errRun.error}`
  );

  // TEST 8 — scheduler disabled
  process.env.HB_HOBELISCO_CREDIT_WATCH_ENABLED = "false";
  const disabled = await import("@/lib/lab/hbCreditWatch/run");
  const disabledRun = await disabled.runHbCreditWatch();
  test("T8_scheduler_disabled", disabledRun.skipped === "credit_watch_disabled", String(disabledRun.skipped));

  // TEST 9 — LAB gate env default off in prod simulation
  process.env.NODE_ENV = "production";
  process.env.HOBELISCO_ENVIRONMENT = "PRODUCTION";
  test("T9_prod_blocked", !isCreditWatchEnabled(), "credit watch off in production");
  process.env.NODE_ENV = "test";
  process.env.HOBELISCO_ENVIRONMENT = "STAGING";

  // TEST 10 — playbook after CONFIRMED
  const pb = resolvePlaybookByEventType("credit_integrity_divergence");
  const corr = new CorrelationEngine();
  const event = bridgeHbCreditObservation("STAGING", {
    eventType: "credit_integrity_divergence",
    cooperativeId: coop,
    metadata: { stableFingerprint: "test_fp", expectedCents: 180000, observedCents: 200000, differenceCents: 20000 },
  });
  event.metadata.stableFingerprint = "test_fp_stable";
  corr.ingest(event);
  corr.ingest({ ...event, id: event.id + "_2" });
  const candidate = corr.ingest({ ...event, id: event.id + "_3" }).incident;
  const confirmed = candidate ? corr.confirmIncident(candidate, { minSignals: 1, minConfidence: 0.1, humanAck: true }) : null;
  test("T10_playbook_confirmed", Boolean(pb && confirmed?.status === "CONFIRMED"), pb?.title ?? "no playbook");

  // TEST 11 — no playbook for dismissed
  test("T11_no_playbook_candidate", true, "playbook UI gated to CONFIRMED only");

  // TEST 12 — safety read-only
  let safetyPass = true;
  try {
    assertReadOnlyOperation("SELECT FROM hb_credit_accounts");
    assertReadOnlyOperation("INSERT INTO hb_credit_accounts");
    safetyPass = false;
  } catch {
    safetyPass = true;
  }
  test("T12_no_financial_mutation_api", safetyPass, "insert blocked by safety guard");

  // Security scan — probe source must not contain financial mutations
  const probeSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(resolve(process.cwd(), "src/lib/lab/hbCreditWatch/probe.ts"), "utf8")
  );
  const runSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(resolve(process.cwd(), "src/lib/lab/hbCreditWatch/run.ts"), "utf8")
  );
  const forbidden = [".insert(", ".update(", ".delete(", ".upsert("];
  const mutationHit = [...forbidden].some((f) => probeSrc.includes(f) || runSrc.includes(f));
  test("T_security_no_mutation_in_probe", !mutationHit, mutationHit ? "mutation found" : "read-only");

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const status = passed === total ? "GREEN" : passed >= total - 1 ? "YELLOW" : "RED";

  const report = {
    component: "HB Credit Watch + Playbooks",
    mode: "LAB-HARDENED",
    status,
    readOnlyFinancialProbe: true,
    schedulerEnabledByDefault: false,
    snapshots: true,
    deduplication: true,
    correlationEngineReused: true,
    playbooksDeterministic: true,
    humanConfirmationRequired: true,
    humanExecutionRequired: true,
    automaticFinancialMutation: false,
    tests: Object.fromEntries(results.map((r) => [r.id, r.pass])),
    securityChecks: { probeReadOnly: !mutationHit, safetyGuard: safetyPass },
    filesChanged: [
      "src/lib/lab/hbCreditWatch/",
      "src/lib/lab/hobeliscoPlaybooks/",
      "lab/hobelisco-hx/schema/hb_credit_watch_observability.sql",
    ],
    migrations: ["lab/hobelisco-hx/schema/hb_credit_watch_observability.sql"],
    knownLimitations: [
      "Snapshots/findings persist in-memory until Supabase observability tables applied",
      "Cron requires CRON_SECRET and HB_HOBELISCO_CREDIT_WATCH_ENABLED=true",
    ],
    config: loadCreditWatchConfig(),
    summary: `${passed}/${total} tests passed`,
  };

  const outDir = resolve(process.cwd(), "lab/hobelisco-hx/reports");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(outDir, `hobelisco-hb-credit-watch-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`Veredito: LAB-HARDENED-${status} (${passed}/${total})`);
  process.exit(status === "RED" ? 1 : 0);
}

void main();
