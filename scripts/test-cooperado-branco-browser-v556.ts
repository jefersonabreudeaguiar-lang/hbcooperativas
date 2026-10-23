/**
 * v556 — cooperado browser não preso no gate de login / mixed DPL.
 * npx tsx scripts/test-cooperado-branco-browser-v556.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const route = readFileSync(join(ROOT, "src/components/auth/ProtectedRoute.tsx"), "utf8");
const release = readFileSync(join(ROOT, "src/lib/pwa/clientRelease.ts"), "utf8");
const watchdog = readFileSync(
  join(ROOT, "src/components/cooperado/CooperadoPainelPaintWatchdog.tsx"),
  "utf8",
);

assert.match(route, /cooperadoGaSessionInStorage/);
assert.match(route, /cooperadoGaSessionInStorage\(\) && \(!user \|\| loading/);
assert.match(release, /coopSess&&!standalonePwa\(\)/);
assert.match(watchdog, /3_000/);

console.log("OK test-cooperado-branco-browser-v556");
