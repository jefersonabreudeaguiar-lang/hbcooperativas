/**
 * Financeiro cooperado: resumo da ficha + entregas por item + total em aberto.
 * npx tsx scripts/test-cooperado-financeiro-resumo-ficha-v494.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 494, "build 494+");
assert.match(read("public/sw.js"), /hb-coop-build-49/);

const nav = read("src/components/cooperado/CooperadoFinanceiroSecoesNav.tsx");
assert.match(nav, /label: "Resumo"/);
assert.doesNotMatch(nav, /label: "A receber"/);

const ficha = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.doesNotMatch(ficha, /CooperadoQuantoVouReceberPainel/);
assert.match(ficha, /Resumo financeiro/);
assert.match(ficha, /Resumo de entregas por itens/);
assert.match(ficha, /Total em aberto/);
assert.match(ficha, /totalEmAbertoFicha/);
assert.match(ficha, /apenasPendentes: true/);
assert.match(ficha, /Buscando a ficha em aberto da cooperativa/);
assert.doesNotMatch(ficha, /CooperadoInicioValorReceberCard/);

console.log("ok: Financeiro cooperado = resumo da ficha + itens + total em aberto (v494)");
