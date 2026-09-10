import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  compareDeterministicRuns,
  runFullCoreArena,
  runStressEventBurst,
} from "@lab/hobelisco-hx/arena/FullCoreArenaRunner";
import { runArenaSimulation } from "@lab/hobelisco-hx/arena/SimulationRunner";
import { HOBELISCO_LAB_HARDENED_VERSION, LAB_ORGANISM_ID } from "@lab/hobelisco-hx/config";
import { runClosureAudit } from "@lab/hobelisco-hx/closure-audit/runClosureAudit";
import { runLifeAudit } from "@lab/hobelisco-hx/life-audit/runLifeAudit";
import { runFullOrganismAudit } from "@lab/hobelisco-hx/full-audit/runFullAudit";

process.env.HOBELISCO_ENVIRONMENT = "LAB";
process.env.HB_HOBELISCO_LAB_ENABLED = "true";

function parseArg(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return Number.parseInt(arg.split("=")[1], 10);
}

const arenaCount = parseArg("count", 10000);
const arenaSeed = parseArg("seed", 20260909);

console.log("═══ HOBELISCO LAB HARDENED AUDIT ═══\n");

const closure = runClosureAudit();
console.log(`Closure: ${closure.organismVerdict} (${closure.passed}/${closure.totalTests})`);

const life = runLifeAudit();
console.log(`V1 Life: ${life.lifeVerdict} (${life.passed}/${life.totalTests})`);

const arenaV1 = runArenaSimulation();
console.log(`V1 Arena: ${arenaV1.scenariosPassed}/${arenaV1.scenariosRun}`);

console.log("\n── Determinism test (1000 × seed A × 2) ──");
const det = compareDeterministicRuns(arenaSeed, 1000);
console.log(`Deterministic match: ${det.match} (A: ${det.runA.passed}/${1000}, B: ${det.runB.passed}/${1000})`);

console.log("\n── Seed B invariants (1000) ──");
const seedB = runFullCoreArena({ count: 1000, seed: arenaSeed + 99991, maxFailures: 0 });
console.log(`Seed B: passed=${seedB.passed} survival=${seedB.survivalRate}%`);

console.log(`\n── Full Core Arena (${arenaCount} sims, seed ${arenaSeed}) ──`);
const arena1k = runFullCoreArena({ count: 1000, seed: arenaSeed });
const arena10k = arenaCount >= 10000 ? runFullCoreArena({ count: 10000, seed: arenaSeed }) : arena1k;

console.log(`1000: passed=${arena1k.passed} p50=${arena1k.p50Ms}ms p95=${arena1k.p95Ms}ms p99=${arena1k.p99Ms}ms`);
if (arenaCount >= 10000) {
  console.log(`10000: passed=${arena10k.passed} duration=${arena10k.durationMs}ms p50=${arena10k.p50Ms}ms p95=${arena10k.p95Ms}ms p99=${arena10k.p99Ms}ms`);
}

console.log("\n── Stress burst (10000 events) ──");
const stress = runStressEventBurst(10000);
console.log(`Stress: ${stress.ok ? "OK" : "FAIL"} — ${stress.detail}`);

const fullOrg = runFullOrganismAudit();
console.log(`Full Organism: ${fullOrg.organismVerdict} (${fullOrg.passed}/${fullOrg.totalTests})`);

const remainingGaps: string[] = [];
if (arenaCount < 10000) remainingGaps.push("10.000 sims: executado com count menor via --count");

const criticalFail =
  life.lifeVerdict !== "LIFE-GREEN" ||
  closure.organismVerdict === "ORGANISM-RED" ||
  !det.match ||
  !stress.ok ||
  closure.productionBoundary.violations > 0;

const arena10kOk = arenaCount >= 10000 ? arena10k.failed === 0 || arena10k.passed / arena10k.total >= 0.99 : true;

let verdict: "LAB-HARDENED-GREEN" | "LAB-HARDENED-AMBER" | "LAB-HARDENED-RED" = "LAB-HARDENED-GREEN";
if (criticalFail) verdict = "LAB-HARDENED-RED";
else if (!arena10kOk || fullOrg.organismVerdict === "ORGANISM-AMBER") verdict = "LAB-HARDENED-AMBER";

const report = {
  version: HOBELISCO_LAB_HARDENED_VERSION,
  generatedAt: new Date().toISOString(),
  verdict,
  organismId: LAB_ORGANISM_ID,
  lifeState: closure.lifeState,
  vitality: closure.vitality,
  immunityReadiness: closure.immunityReadiness,
  tests: { closure: closure.passed, fullOrganism: fullOrg.passed, life: life.passed },
  closure: { verdict: closure.organismVerdict, passed: closure.passed, total: closure.totalTests },
  v1Life: { verdict: life.lifeVerdict, passed: life.passed },
  v1Arena: { passed: arenaV1.scenariosPassed, total: arenaV1.scenariosRun },
  determinism: { ...det, seedB: { passed: seedB.passed, survivalRate: seedB.survivalRate } },
  arena1000: arena1k,
  arena10000: arenaCount >= 10000 ? arena10k : { notExecuted: true, reason: "use --count=10000" },
  performanceComparison: {
    arena1000: { p50: arena1k.p50Ms, p95: arena1k.p95Ms, p99: arena1k.p99Ms, avg: arena1k.averageLatencyMs, durationMs: arena1k.durationMs },
    arena10000: arenaCount >= 10000 ? { p50: arena10k.p50Ms, p95: arena10k.p95Ms, p99: arena10k.p99Ms, avg: arena10k.averageLatencyMs, durationMs: arena10k.durationMs } : null,
  },
  stress,
  fullOrganism: { verdict: fullOrg.organismVerdict, passed: fullOrg.passed },
  attackMatrix: closure.attacks,
  memory: closure.memory,
  threatDNA: closure.threatDNA,
  antibodies: closure.antibodies,
  evolution: closure.evolution,
  guardian: closure.guardian,
  circuitBreaker: closure.circuitBreaker,
  financialBoundary: closure.financialBoundary,
  cooperativeIsolation: closure.cooperativeIsolation,
  replay: closure.replay,
  snapshot: closure.snapshot,
  deathReincarnation: closure.deathReincarnation,
  hibernation: closure.hibernation,
  organRestart: closure.organRestart,
  redTeam: closure.redTeam,
  loopGuard: closure.loopGuard,
  securityScan: closure.securityScan,
  performance: {
    arena1000Ms: arena1k.durationMs,
    arena10000Ms: arenaCount >= 10000 ? arena10k.durationMs : null,
    memoryPeak: arenaCount >= 10000 ? arena10k.memoryPeakEntries : arena1k.memoryPeakEntries,
    eventCount: stress.eventsProcessed,
  },
  productionViolations: closure.productionBoundary.violations,
  remainingGaps,
};

const ts = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `hobelisco-lab-hardened-${ts}.json`), JSON.stringify(report, null, 2), "utf8");

console.log(`\n═══ VERDICT: ${verdict} ═══`);
console.log(`Report: lab/hobelisco-hx/reports/hobelisco-lab-hardened-${ts}.json`);

process.exit(verdict === "LAB-HARDENED-RED" ? 1 : 0);
