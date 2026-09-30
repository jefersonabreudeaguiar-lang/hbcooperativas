/**
 * GET limites completo (sem fast) reconcilia utilizado e persiste liberado = teto% × crédito-base da ficha.
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

const fast = buildCreditLimitesRequestQuery(CNPJ, { fast: true });
assert.ok(fast.includes("fast=1"), "GET rápido envia fast=1");

const withIds = buildCreditLimitesRequestQuery(CNPJ, { cooperadoIds: ["c1", "c2"] });
assert.ok(withIds.includes("cooperadoIds=c1%2Cc2"), "lista de ativos na query");

console.log("OK — limites GET contract (resync opt-in)");
