/**
 * v556 — chunk DPL rescue deve recarregar após purge (não parar em tela branca).
 * npx tsx scripts/test-cooperado-chunk-rescue-reload-v556.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const chunk = readFileSync(join(ROOT, "src/lib/pwa/chunkDplAlignGuard.ts"), "utf8");
const crash = readFileSync(join(ROOT, "src/lib/pwa/runtimeCrashForensics.ts"), "utf8");

assert.match(chunk, /hbCoopSilentPwaPurge\(\);location\.replace\(next\)/);
assert.match(crash, /maybeRescueCooperado/);
assert.match(crash, /pwa-rescue\.html\?auto=1/);

console.log("OK test-cooperado-chunk-rescue-reload-v556");
