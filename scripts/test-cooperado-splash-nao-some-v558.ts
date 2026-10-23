/**
 * v558 — splash do app só some no login ou com painel pintado.
 * npx tsx scripts/test-cooperado-splash-nao-some-v558.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
const route = readFileSync(join(ROOT, "src/components/auth/ProtectedRoute.tsx"), "utf8");
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");

assert.match(auth, /path === "\/login"/);
assert.doesNotMatch(auth, /cooperadoPwaInstantPaintReady\(session\)[\s\S]{0,80}dismissCooperadoBootShell/);
assert.doesNotMatch(route, /dismissCooperadoBootShell/);
assert.match(layout, /position: "fixed"/);
assert.match(layout, /zIndex: 9999/);
assert.match(boot, /function sessUser/);
assert.doesNotMatch(boot, /if\(!standalone&&!mobile\)\{hide\(\);return;\}/);

console.log("OK test-cooperado-splash-nao-some-v558");
