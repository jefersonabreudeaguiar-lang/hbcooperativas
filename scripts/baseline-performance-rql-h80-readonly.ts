/**
 * HX 8.0 — baseline read-only (Node). Não escreve disco nem Supabase.
 * npx tsx scripts/baseline-performance-rql-h80-readonly.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { emptyInitialData } from "../src/mock/data.ts";
import { mergeSyncTierRequests } from "../src/lib/performance/syncTier.ts";

const ROOT = process.cwd();
const ROUTE_HOPS = ["dashboard", "notas-pedido", "dashboard"] as const;
const ROUNDS = 5;

function bench(label: string, fn: () => void, iterations: number): { label: string; p50: number; p95: number } {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0;
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
  return { label, p50, p95 };
}

function simulateNavigationRound() {
  let revision = 0;
  const data = structuredClone(emptyInitialData);
  for (const hop of ROUTE_HOPS) {
    revision++;
    const notasLen = data.notasPedido?.length ?? 0;
    const cooperadosLen = data.cooperados?.length ?? 0;
    void hop;
    void notasLen;
    void cooperadosLen;
  }
  return revision;
}

function countHookUsage(): { useAppData: number; useAppDataSelector: number } {
  let useAppData = 0;
  let useAppDataSelector = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(name)) continue;
      const src = readFileSync(p, "utf8");
      useAppData += (src.match(/\buseAppData\s*\(/g) ?? []).length;
      useAppDataSelector += (src.match(/\buseAppDataSelector\s*\(/g) ?? []).length;
    }
  };
  walk(join(ROOT, "src"));
  return { useAppData, useAppDataSelector };
}

function main() {
  console.log("=== HX 8.0 RQL baseline (read-only) ===\n");

  const persist = bench(
    "JSON.stringify(AppData shell)",
    () => JSON.stringify(emptyInitialData),
    200
  );
  const parse = bench(
    "JSON.parse(AppData shell)",
    () => JSON.parse(JSON.stringify(emptyInitialData)),
    200
  );

  const nav = bench(
    `sim ${ROUNDS}× (dashboard→notas→dashboard) selector-ish`,
    () => {
      for (let i = 0; i < ROUNDS; i++) simulateNavigationRound();
    },
    50
  );

  const tierMerge = bench(
    "mergeSyncTierRequests ×1000",
    () => {
      let cur = null as ReturnType<typeof mergeSyncTierRequests> | null;
      for (let i = 0; i < 1000; i++) {
        cur = mergeSyncTierRequests(cur, {
          tier: i % 2 === 0 ? "pulse" : "operacional_full",
          force: i % 3 === 0,
        });
      }
    },
    30
  );

  const hooks = countHookUsage();

  console.log("Persistência (ms):");
  console.log(`  ${persist.label}: p50=${persist.p50.toFixed(3)} p95=${persist.p95.toFixed(3)}`);
  console.log(`  ${parse.label}: p50=${parse.p50.toFixed(3)} p95=${parse.p95.toFixed(3)}`);
  console.log("\nNavegação simulada (ms):");
  console.log(`  ${nav.label}: p50=${nav.p50.toFixed(3)} p95=${nav.p95.toFixed(3)}`);
  console.log("\nScheduler (ms):");
  console.log(`  ${tierMerge.label}: p50=${tierMerge.p50.toFixed(3)} p95=${tierMerge.p95.toFixed(3)}`);
  console.log("\nSubscrição React (contagem em src/):");
  console.log(`  useAppData(): ${hooks.useAppData}`);
  console.log(`  useAppDataSelector(): ${hooks.useAppDataSelector}`);
  console.log(
    "\nNo browser: performance.getEntriesByType('mark') filtrando 'rql:route:' após trocar abas."
  );
  console.log("\nBaseline 8.0 concluído (sem mutação).");
}

main();
