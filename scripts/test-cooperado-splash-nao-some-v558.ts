/**
 * Superado pelo v560 (abertura v552). Mantém checagens que ainda valem.
 * npx tsx scripts/test-cooperado-splash-nao-some-v558.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
const route = readFileSync(join(ROOT, "src/components/auth/ProtectedRoute.tsx"), "utf8");

assert.match(layout, /position: "fixed"/);
assert.match(layout, /zIndex: 9999/);
assert.doesNotMatch(route, /dismissCooperadoBootShell/);

console.log("OK test-cooperado-splash-nao-some-v558");
