/**
 * Superado pelo v560. Script do splash continua depois do HTML.
 * npx tsx scripts/test-cooperado-splash-body-v559.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");

const bootIdx = layout.indexOf("buildInlineCooperadoBootShellScript()");
const shellIdx = layout.indexOf('id="hb-coop-boot-shell"');
assert.ok(shellIdx >= 0 && bootIdx > shellIdx, "script do splash deve vir depois do #hb-coop-boot-shell");
assert.match(boot, /DOMContentLoaded/);

console.log("OK test-cooperado-splash-body-v559");
