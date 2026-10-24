/**
 * Fase 2 v566 — quiescência na troca de aba + pausa trabalho financeiro pesado.
 * npx tsx scripts/test-cooperado-fase2-tab-fluidez-v566.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const pulse = readFileSync(join(ROOT, "src/lib/bic/bicRevisionPulse.ts"), "utf8");
const keepAlive = readFileSync(
  join(ROOT, "src/components/performance/CooperadoMobileTabKeepAlive.tsx"),
  "utf8"
);
const foreground = readFileSync(
  join(ROOT, "src/lib/performance/cooperadoForegroundOperacionalSync.ts"),
  "utf8"
);
const ficha = readFileSync(
  join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"),
  "utf8"
);

assert.match(pulse, /cooperadoGaPausaTrabalhoFinanceiroPesado\(user\)\) return/);
assert.match(keepAlive, /markCooperadoTabPathChange\(effectivePath\)/);
assert.match(keepAlive, /não pode esconder o painel ativo/);
assert.match(foreground, /cooperadoGaPausaTrabalhoFinanceiroPesado\(session\)/);
assert.match(ficha, /cooperadoGaPausaTrabalhoFinanceiroPesado\(user\)/);

console.log("OK test-cooperado-fase2-tab-fluidez-v566");
