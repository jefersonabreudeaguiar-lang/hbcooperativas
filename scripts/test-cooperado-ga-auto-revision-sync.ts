/**
 * GA cooperado: revisão na nuvem deve disparar sync silencioso (não só notas light pull).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const foreground = readFileSync(
  join(ROOT, "src/lib/performance/cooperadoForegroundOperacionalSync.ts"),
  "utf8"
);
const pulse = readFileSync(join(ROOT, "src/lib/bic/bicRevisionPulse.ts"), "utf8");

assert.match(
  foreground,
  /isCooperadoMobileGaPromoted\(session\)[\s\S]*requestCooperadoStaffRevisionSync\(\)/,
  "foreground GA deve chamar requestCooperadoStaffRevisionSync em revisão"
);
assert.match(pulse, /requestCooperadoStaffRevisionSync\(\)/, "pulso BIC deve sync operacional na mudança de revisão");
assert.doesNotMatch(
  pulse,
  /runCooperadoGaSyncBaseInformacoesFinanceiras/,
  "pulso não deve usar base sync bloqueada na abertura"
);

console.log("OK test-cooperado-ga-auto-revision-sync");
