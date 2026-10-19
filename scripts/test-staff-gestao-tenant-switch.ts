/**
 * Troca de CNPJ do responsável esvazia a memória do painel anterior.
 * npx tsx scripts/test-staff-gestao-tenant-switch.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shouldAdoptStaffPersistHint,
  shouldFlushAppDataMemoryOnTenantChange,
} from "../src/lib/staff/staffGestaoTenantSwitch.ts";

const CASA = "62351750000165";
const NOVA = "11222333000181";

assert.equal(shouldFlushAppDataMemoryOnTenantChange(CASA, NOVA), true, "CNPJ novo esvazia a casa");
assert.equal(shouldFlushAppDataMemoryOnTenantChange(CASA, CASA), false, "mesmo responsável não esvazia");
assert.equal(shouldFlushAppDataMemoryOnTenantChange("", NOVA), false, "sem painel anterior não precisa esvaziar");
assert.equal(shouldFlushAppDataMemoryOnTenantChange(CASA, ""), true, "sair da casa esvazia");

assert.equal(shouldAdoptStaffPersistHint("responsavel", NOVA), true);
assert.equal(shouldAdoptStaffPersistHint("cooperado", NOVA), false, "cooperado não troca a chave do responsável");
assert.equal(shouldAdoptStaffPersistHint("responsavel", "123"), false);

const store = readFileSync(join(import.meta.dirname ?? __dirname, "../src/services/dataStore.ts"), "utf8");
assert.match(store, /adoptIncomingTenantForLocalLoad/);
assert.match(store, /invalidateCache\(\);\s*\n\s*saveBatchPending = null;/);

const logoutSlice = store.slice(store.indexOf("export async function logoutAndClearSession"));
assert.match(logoutSlice, /invalidateCache\(\)/);

console.log("ok: troca de CNPJ do responsável esvazia a memória do painel anterior");
