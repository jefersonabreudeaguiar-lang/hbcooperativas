/**
 * Etapa trava — valor visível sem UI presa em sync/motor (v553).
 * npx tsx scripts/test-cooperado-etapa-trava-v553.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8",
);
const sync = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
const gate = readFileSync(
  join(ROOT, "src/components/cooperado/CooperadoFinanceiroGate.tsx"),
  "utf8",
);
const garantia = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoGaGarantiaValorReceberSync.ts"),
  "utf8",
);
const integrity = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoReleaseIntegrityWatch.ts"),
  "utf8",
);

assert.match(hook, /const syncBloqueiaCard =/);
assert.match(hook, /&& !apresentacaoCard/);
assert.match(hook, /!persistidoJaTemValor/);
assert.match(sync, /silent:\s*true/);
assert.match(gate, /cooperadoGaValorReceberExibicaoResolvida/);
assert.match(garantia, /cooperadoGaValorReceberExibicaoResolvida\(user\)[\s\S]*clearGarantiaTimers\(\)/);
assert.match(integrity, /cooperadoGaValorReceberExibicaoResolvida\(user\)/);

console.log("OK test-cooperado-etapa-trava-v553");
