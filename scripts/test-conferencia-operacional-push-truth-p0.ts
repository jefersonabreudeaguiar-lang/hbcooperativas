/**
 * P0 — push operacional autoritativo pós-conferência usa verdade operacional (ficha completa).
 * npx tsx scripts/test-conferencia-operacional-push-truth-p0.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const sync = readFileSync(join(ROOT, "src/services/cooperativaSyncCloudService.ts"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(sync.includes("getDataOperationalTruth"), "import verdade operacional");
assert(sync.includes("dataBaselineForOperacionalPush"), "baseline dedicado ao push");
assert(sync.includes("relreadDataForOperacionalPush"), "releitura pós-await no push autoritativo");
assert(
  sync.includes("if (authoritative) return getDataOperationalTruth();"),
  "authoritative ignora view scoped de getData()"
);

console.log("test-conferencia-operacional-push-truth-p0.ts done.");
