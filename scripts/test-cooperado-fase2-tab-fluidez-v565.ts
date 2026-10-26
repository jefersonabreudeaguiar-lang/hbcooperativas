/**
 * Fase 2 — pausa GA + pulso BIC sem rematerializeOnly no mobile.
 * npx tsx scripts/test-cooperado-fase2-tab-fluidez-v565.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const pulse = readFileSync(join(ROOT, "src/lib/bic/bicRevisionPulse.ts"), "utf8");
const pausa = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaPausaTrabalhoPesado.ts"), "utf8");
const quiescence = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoTabSwitchQuiescence.ts"),
  "utf8"
);
const ficha = readFileSync(join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"), "utf8");

assert.match(pulse, /cooperadoMobileUiQuiescenceActive\(\)\) return/);
assert.match(pulse, /cooperadoGaPausaPulsoBicOuRematerializacao\(user\)\) return/);
assert.match(pulse, /scheduleCooperadoBicHybridIdleTask\(\(\) => void runRevisionPulse\(user\), 2_000\)/);
assert.match(pulse, /Mobile: revisão igual/);
assert.doesNotMatch(pulse, /recordBicParidadePulse\("rematerializeOnly"\)[\s\S]{0,80}rematerializarSilencioso\(user\)[\s\S]{0,40}\} finally/);

assert.match(pausa, /cooperadoMobileUiQuiescenceActive\(\)\) return true/);
assert.match(quiescence, /QUIET_MS = 14_000/);
assert.match(ficha, /cooperadoTabSwitchQuiescenceActive\(\)\) return/);
assert.match(ficha, /cooperadoGaPausaTrabalhoFinanceiroPesado\(user\)\) return/);

console.log("OK test-cooperado-fase2-tab-fluidez-v565");
