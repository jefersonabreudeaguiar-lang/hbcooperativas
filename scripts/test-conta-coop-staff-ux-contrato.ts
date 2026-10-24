/**
 * Área responsável /conta-coop — timeouts, paginação limites, fail-open nuvem, abas scroll.
 * npx tsx scripts/test-conta-coop-staff-ux-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 616, "build 616+ com pacote responsável HB");

const content = read("src/app/(app)/conta-coop/ContaCoopContent.tsx");
assert.ok(content.includes("withContaCoopFetchTimeout"), "dashboard/limites com timeout");
assert.ok(content.includes("LIMITES_TABLE_PAGE_SIZE"), "paginação na tabela de limites");
assert.ok(content.includes("limitesLinhasPagina"), "render paginado");
assert.ok(content.includes("CNPJ_RESOLVE_TIMEOUT_MS"), "CNPJ não trava skeleton infinito");
assert.match(content, /scheduleContaCoopAuxSync[\s\S]*ensureCreditosBaseCentsForPost/, "crédito-base fora do caminho crítico");
assert.ok(content.includes("handleTabChangeWithPrefetch"), "prefetch de painéis lazy");
assert.ok(content.includes("scrollable"), "abas com rolagem horizontal");

const fetchHelper = read("src/lib/hb-credit/contaCoopStaffFetch.ts");
assert.ok(fetchHelper.includes("Promise.race"), "race com timeout");

const gate = read("src/components/hb-credit/CloudSessionGate.tsx");
assert.ok(gate.includes("staffHbFailOpen"), "responsável fail-open como cooperado");

const tabs = read("src/components/hb-credit/ContaCoopSegmentTabs.tsx");
assert.ok(tabs.includes("scrollable"), "componente de abas suporta scroll");

console.log("OK — test-conta-coop-staff-ux-contrato");
