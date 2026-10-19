/**
 * Cadastro do responsável só fecha se o login na nuvem nasceu.
 * npx tsx scripts/test-register-cooperativa-exige-login-nuvem.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const store = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/services/dataStore.ts"),
  "utf8"
);

const registerFn = store.slice(store.indexOf("export async function registerCooperativa"));
assert.match(registerFn, /const cloudUserOk = await registerCloudUser/);
assert.match(registerFn, /if \(!cloudUserOk\)/);
assert.match(registerFn, /persistSession\(safeUser\)/);
assert.ok(
  registerFn.indexOf("const cloudUserOk = await registerCloudUser") <
    registerFn.indexOf("persistSession(safeUser)"),
  "não grava sessão local antes do login na nuvem"
);
assert.match(registerFn, /sameEmailAsCloud/);

console.log("ok: cadastro do responsável exige login na nuvem");
