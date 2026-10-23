/**
 * v564 — com valor na tela, sync GA não reexecuta motor pesado nem garantia em loop.
 * npx tsx scripts/test-cooperado-perf-sem-trava-v564.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8",
);
const garantia = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoGaGarantiaValorReceberSync.ts"),
  "utf8",
);
const recovery = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery.ts"),
  "utf8",
);

assert.match(hook, /cooperadoGaValorReceberExibicaoResolvida/);
assert.match(hook, /!persistidoJaTemValor/);
assert.match(hook, /const atualizando = valorJaNaTela/);
assert.match(garantia, /if \(cooperadoGaValorReceberExibicaoResolvida\(user\)\)[\s\S]{0,120}clearGarantiaTimers/);
assert.doesNotMatch(garantia, /onGarantiaTick[\s\S]{0,200}cooperadoPilotForcarRematerializacaoFinanceira/);
assert.match(recovery, /if \(cooperadoGaPausaTrabalhoFinanceiroPesado\(user\)\) return;/);
assert.match(garantia, /cooperadoGaPausaTrabalhoFinanceiroPesado\(user\)\) return/);

console.log("OK test-cooperado-perf-sem-trava-v564");
