/**
 * v555 — rollback v553 + sem script diag no Gate.
 * npx tsx scripts/test-cooperado-rollback-v555.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const gate = readFileSync(
  join(ROOT, "src/components/cooperado/CooperadoFinanceiroGate.tsx"),
  "utf8",
);
const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8",
);
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");

assert.doesNotMatch(gate, /hb-cooperado-acesso-diag/);
assert.doesNotMatch(gate, /installCooperadoValorBrowserMobileDiag/);
assert.doesNotMatch(hook, /syncBloqueiaCard/);
assert.match(boot, /setTimeout\(hide/);

console.log("OK test-cooperado-rollback-v555");
