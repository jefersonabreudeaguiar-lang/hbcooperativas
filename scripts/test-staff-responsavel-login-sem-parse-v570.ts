/**
 * Responsável PC — login não dispara parse síncrono do persist.
 * npx tsx scripts/test-staff-responsavel-login-sem-parse-v570.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
const store = readFileSync(join(ROOT, "src/services/dataStore.ts"), "utf8");

assert.match(auth, /gestaoLogin\)[\s\S]{0,200}ensureCooperadoAppDataEagerWarm\(\)/);
assert.doesNotMatch(
  auth,
  /else if \(gestaoLogin\)[\s\S]{0,220}preloadAppData\(\)/
);
assert.match(store, /staffGestaoPersistReloadIdleTimeoutMs/);
assert.match(store, /12_000/);

console.log("OK test-staff-responsavel-login-sem-parse-v570");
