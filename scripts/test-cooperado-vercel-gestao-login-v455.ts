/**
 * Vercel 450–454 quebrava: gestaoLogin sumiu do login.
 * npx tsx scripts/test-cooperado-vercel-gestao-login-v455.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
assert.equal(APP_BUILD_VERSION, 455);

const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
assert.ok(
  auth.includes(
    "const gestaoLogin = jwtRole !== \"cooperado\" && canAccessPainelResponsavelSession(safeUser)"
  ),
  "login define gestaoLogin antes de usar"
);
assert.ok(auth.includes("} else if (gestaoLogin) {"));

console.log("test-cooperado-vercel-gestao-login-v455: OK");
