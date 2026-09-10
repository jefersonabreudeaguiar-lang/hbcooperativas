#!/usr/bin/env npx tsx
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// Re-export runner for CLI
import { runFullCoreArena } from "@lab/hobelisco-hx/arena/FullCoreArenaRunner";
import { runArenaSimulation } from "@lab/hobelisco-hx/arena/SimulationRunner";
import { formatArenaReportText } from "@lab/hobelisco-hx/reportFormatter";

function parseArg(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return Number.parseInt(arg.split("=")[1], 10);
}

const count = parseArg("count", 0);
const seed = parseArg("seed", 20260909);

if (count > 0) {
  console.log(`Full Core Arena: ${count} simulations, seed=${seed}`);
  const report = runFullCoreArena({ count, seed });
  const ts = report.executedAt.replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `arena-full-${count}-${ts}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  console.log(`Total: ${report.total} | Passed: ${report.passed} | Failed: ${report.failed}`);
  console.log(`Survival: ${report.survivalRate}% | Containment: ${report.containmentRate}%`);
  console.log(`Latency avg=${report.averageLatencyMs}ms p50=${report.p50Ms} p95=${report.p95Ms} p99=${report.p99Ms}`);
  console.log(`Duration: ${report.durationMs}ms`);
  if (report.failures.length) console.log(`Failures logged: ${report.failures.length}`);
  console.log(`\nReport: ${path}`);
  process.exit(report.failed > 0 && report.passed / report.total < 0.99 ? 1 : 0);
}

const report = runArenaSimulation();
const ts = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `arena-${ts}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(dir, `arena-${ts}.txt`), formatArenaReportText(report), "utf8");
console.log(formatArenaReportText(report));
process.exit(report.allMandatoryPassed ? 0 : 1);
