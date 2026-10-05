/**
 * Fase A — gate perf + fluxos críticos (notas, conferência, sync operacional).
 * npx tsx scripts/run-suite-perf-fluxos.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const SUITE: { category: string; script: string }[] = [
  { category: "PERF", script: "baseline-performance-rql-h80-readonly.ts" },
  { category: "PERF", script: "test-app-scheduler-h80.ts" },
  { category: "PERF", script: "test-render-rql-h81.ts" },
  { category: "PERF", script: "test-cooperado-cold-start-h90.ts" },
  { category: "PERF", script: "test-perf-notas-cooperado-p0.ts" },
  { category: "PERF", script: "test-perf-notas-cooperado-p2.ts" },
  { category: "PERF", script: "test-perf-responsavel-fila-p1.ts" },
  { category: "PERF", script: "test-perf-notas-p3.ts" },
  { category: "PERF", script: "test-perf-notas-p4.ts" },
  { category: "PERF", script: "test-perf-notas-p5.ts" },
  { category: "PERF", script: "test-perf-notas-p6.ts" },
  { category: "PERF", script: "test-perf-notas-p7.ts" },
  { category: "PERF", script: "test-rql-browser-instrumentation-h90.ts" },
  { category: "SYNC", script: "test-fase-d-sync-gate.ts" },
  { category: "PERF", script: "test-rql-admin-stats-worker-h85.ts" },
  { category: "FLUXO", script: "simulate-entrega-flow.ts" },
  { category: "FLUXO", script: "simulate-sync-flows.ts" },
  { category: "FLUXO", script: "test-pending-entrega-publish-p0.ts" },
  { category: "FLUXO", script: "test-cooperado-rascunho-p1.ts" },
  { category: "FLUXO", script: "test-conferencia-h82.ts" },
  { category: "FLUXO", script: "test-conferencia-etapa4-p0.ts" },
  { category: "FLUXO", script: "test-conferencia-etapa4-p1.ts" },
  { category: "FLUXO", script: "test-conferencia-etapa4-p2.ts" },
  { category: "FLUXO", script: "test-conferencia-etapa4-p3.ts" },
  { category: "FLUXO", script: "test-operacional-coordination-h888.ts" },
  { category: "FLUXO", script: "test-e2e-alignment-invariants.ts" },
];

function runOne(rel: string): { ok: boolean; ms: number; missing: boolean } {
  const path = join(ROOT, "scripts", rel);
  if (!existsSync(path)) return { ok: false, ms: 0, missing: true };
  const t0 = Date.now();
  const r = spawnSync("npx", ["tsx", path], { cwd: ROOT, stdio: "inherit", shell: true });
  return { ok: r.status === 0, ms: Date.now() - t0, missing: false };
}

let failed = 0;
console.log("=== run-suite-perf-fluxos ===\n");

for (const { category, script } of SUITE) {
  const label = `[${category}] ${script}`;
  process.stdout.write(`${label} … `);
  const result = runOne(script);
  if (result.missing) {
    failed += 1;
    console.log("MISSING");
    continue;
  }
  if (result.ok) {
    console.log(`OK (${result.ms}ms)`);
  } else {
    failed += 1;
    console.log(`FAIL (${result.ms}ms)`);
  }
}

console.log("\n=== build ===");
const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: true });
if (build.status !== 0) failed += 1;

if (failed > 0) {
  console.error(`\nrun-suite-perf-fluxos: ${failed} falha(s)`);
  process.exit(1);
}
console.log("\nrun-suite-perf-fluxos: tudo OK");
