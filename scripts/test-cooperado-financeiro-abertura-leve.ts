/**
 * Cooperado: abrir Financeiro não reconcilia ficha da cooperativa inteira no idle.
 * npx tsx scripts/test-cooperado-financeiro-abertura-leve.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const store = read("src/services/dataStore.ts");
assert.match(store, /session\?\.role !== "cooperado"/);
assert.match(store, /posProcessarFinanceiroLocal/);

const guard = read("src/services/cooperadoFinanceiroGuard.ts");
assert.match(guard, /cooperadoTabSwitchQuiescenceActive/);

const ficha = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.match(ficha, /function FichaCorridaPageBody/);
assert.match(ficha, /if \(isCooperado\) return inner/);

console.log("OK test-cooperado-financeiro-abertura-leve");
