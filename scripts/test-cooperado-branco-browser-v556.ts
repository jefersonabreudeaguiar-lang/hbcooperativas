/**
 * v561 — browser cooperado: mixed DPL sem loop; sem watchdog v556.
 * npx tsx scripts/test-cooperado-branco-browser-v556.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const release = readFileSync(join(ROOT, "src/lib/pwa/clientRelease.ts"), "utf8");
const repair = readFileSync(join(ROOT, "src/lib/pwa/cooperadoPwaSilentRepairInline.ts"), "utf8");

assert.match(release, /coopSess&&!standalonePwa\(\)/);
assert.match(repair, /hbCoopSilentPwaPurgeThen/);
assert.ok(
  !existsSync(join(ROOT, "src/components/cooperado/CooperadoPainelPaintWatchdog.tsx")),
);

console.log("OK test-cooperado-branco-browser-v556");
