/**
 * GET /api/credit/limites — resync pesado só com ?resync=1 (aba Limites leve).
 * npx tsx scripts/test-hb-credit-limites-get-contract.ts
 */
import assert from "node:assert/strict";
import { buildCreditLimitesRequestQuery } from "../src/services/creditApiService";

const CNPJ = "62351750000165";

const light = buildCreditLimitesRequestQuery(CNPJ);
assert.ok(light.startsWith("cnpj="), "query inclui cnpj");
assert.ok(!light.includes("resync"), "GET leve não envia resync");

const heavy = buildCreditLimitesRequestQuery(CNPJ, { resyncInflated: true });
assert.ok(heavy.includes("resync=1"), "sync explícito envia resync=1");

console.log("OK — limites GET contract (resync opt-in)");
