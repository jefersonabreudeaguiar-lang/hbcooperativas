/**
 * Responsável GA — um produto (identidade, LKG, sync abertura vs lifecycle, abas pinadas).
 * npx tsx scripts/test-responsavel-experiencia-unica.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESPONSAVEL_IDENTIDADE_VERSION } from "../src/lib/responsavel/responsavelIdentidade.ts";
import { isStaffGestaoRole } from "../src/lib/staff/staffResponsavelSyncPolicy.ts";
import {
  staffResponsavelLifecycleSyncRequest,
  staffResponsavelOpeningSyncRequest,
} from "../src/lib/staff/staffResponsavelSyncPolicy.ts";
import { STAFF_TAB_PIN_HREFS } from "../src/lib/performance/staffMobileTabKeepAlive.ts";
import { emptyInitialData } from "../src/mock/data.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(RESPONSAVEL_IDENTIDADE_VERSION >= 6, "identidade staff travada");
assert.ok(isStaffGestaoRole("responsavel"));
assert.ok(isStaffGestaoRole("tesoureiro"));
assert.ok(!isStaffGestaoRole("cooperado"));

const opening = staffResponsavelOpeningSyncRequest(emptyInitialData);
assert.ok(opening.tier === "financeiro_delta" || opening.tier === "notas_delta");

const life = staffResponsavelLifecycleSyncRequest(emptyInitialData);
assert.ok(life);
assert.notEqual(life?.tier, "financeiro_delta", "lifecycle não re-hidrata operacional");
assert.notEqual(life?.tier, "operacional_full");

assert.deepEqual([...STAFF_TAB_PIN_HREFS], [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
]);

const store = read("src/services/dataStore.ts");
assert.match(store, /hydrateStaffGestaoFirstPaintFromLastro/);
const guard = read("src/lib/staff/staffGestaoSnapshotGuard.ts");
assert.match(guard, /hb-staff-gestao-lkg-v1/);
assert.match(guard, /preservarStaffGestaoContraWipe/);

const policy = read("src/lib/staff/staffResponsavelSyncPolicy.ts");
assert.match(policy, /Hydrate frio fica só na abertura/);

console.log("OK test-responsavel-experiencia-unica");
