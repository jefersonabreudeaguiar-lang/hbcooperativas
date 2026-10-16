/**
 * Aba Pagar cooperados (responsável) — regressões cirúrgicas.
 * npx tsx scripts/test-staff-ficha-pagar-tab.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const ficha = readFileSync(join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"), "utf8");
const avulsos = readFileSync(join(ROOT, "src/components/ficha/ValoresAvulsosReceberPanel.tsx"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(ficha.includes("resumoPagamentoConsolidado?.valorLiquido"), "total pendente usa consolidado na aba Pagar");
assert(ficha.includes("aba === \"pagar\"") && ficha.includes("mesHbSyncPilot"), "HB sync pilot só na aba Pagar (staff)");
assert(ficha.includes("cooperadosParaPagar.some"), "não limpa cooperado selecionado durante oscilação de sync");
assert(!avulsos.includes("useAppData("), "avulsos sem assinatura global AppData");

console.log("test-staff-ficha-pagar-tab.ts done.");
