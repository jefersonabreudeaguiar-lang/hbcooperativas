/**
 * v581 — painel responsável recalcula após operacional; Em aberto não reidrata latch com motor cheio.
 * npx tsx scripts/test-staff-painel-refresh-v581.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const sync = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
const painel = readFileSync(join(ROOT, "src/services/responsavelPainelIndex.ts"), "utf8");
const conferir = readFileSync(join(ROOT, "src/hooks/useConferirProjection.ts"), "utf8");
const pins = readFileSync(join(ROOT, "src/lib/performance/staffMobileTabKeepAlive.ts"), "utf8");

assert.match(sync, /refreshStaffGestaoPainelLeitura/);
assert.match(painel, /motor\.length === 0/);
assert.match(conferir, /resetResponsavelPainelIndexCache/);
assert.ok(!pins.includes('"/dashboard"'), "dashboard não pinado no keep-alive");

console.log("OK test-staff-painel-refresh-v581");
