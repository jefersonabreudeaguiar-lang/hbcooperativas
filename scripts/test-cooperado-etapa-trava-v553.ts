/**
 * Estabilidade pós-v553 — sem diag no Gate + boot shell com fallback (v555).
 * npx tsx scripts/test-cooperado-etapa-trava-v553.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const gate = readFileSync(
  join(ROOT, "src/components/cooperado/CooperadoFinanceiroGate.tsx"),
  "utf8",
);
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");
const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8",
);

assert.doesNotMatch(gate, /hb-cooperado-acesso-diag/);
assert.doesNotMatch(gate, /installCooperadoValorBrowserMobileDiag/);
assert.match(gate, /cooperadoGaValorReceberExibicaoResolvida\(user\)/);
assert.match(boot, /function sessUser/);
assert.match(hook, /cooperadoGaValorReceberExibicaoResolvida/);

console.log("OK test-cooperado-etapa-trava-v553");
