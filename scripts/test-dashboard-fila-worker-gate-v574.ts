/**
 * S1 — fila do dia no Início não pode depender só de `heavy` quando o worker RQL está ativo.
 * npx tsx scripts/test-dashboard-fila-worker-gate-v574.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dash = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/app/(app)/dashboard/DashboardContent.tsx"),
  "utf8"
);

assert.match(dash, /filaDoDiaPronta\s*=\s*Boolean\(heavy\s*\?\?\s*workerHeavy\)/);
assert.match(dash, /filaDoDiaPronta\s*\?\s*\(\s*\n\s*<FilaDoDiaPanel/);
assert.ok(!dash.includes("{heavy ? (\n        <FilaDoDiaPanel"), "não gatear fila só em heavy");

console.log("OK test-dashboard-fila-worker-gate-v574");
