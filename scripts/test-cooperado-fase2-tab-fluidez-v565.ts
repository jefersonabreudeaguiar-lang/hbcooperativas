/**
 * Fase 2 — pulso BIC não rematerializa com exibição GA resolvida.
 * npx tsx scripts/test-cooperado-fase2-tab-fluidez-v565.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const pulse = readFileSync(join(ROOT, "src/lib/bic/bicRevisionPulse.ts"), "utf8");

assert.match(pulse, /cooperadoGaValorReceberExibicaoResolvida\(user\)\) return/);
assert.match(pulse, /onVisibility[\s\S]{0,200}cooperadoGaValorReceberExibicaoResolvida/);
assert.match(pulse, /scheduleCooperadoBicHybridIdleTask\(\(\) => void runRevisionPulse\(user\), 2_000\)/);

console.log("OK test-cooperado-fase2-tab-fluidez-v565");
