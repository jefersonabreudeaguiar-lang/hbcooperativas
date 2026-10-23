/**
 * v562 — núcleo v552 + entrada sem branco.
 * npx tsx scripts/test-cooperado-abertura-v552-v560.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");
const dismiss = readFileSync(
  join(ROOT, "src/components/performance/CooperadoBootShellDismiss.tsx"),
  "utf8",
);
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");

assert.match(boot, /function sessUser/);
assert.match(boot, /if\(!standalone&&!mobile\)\{hide\(\);return;\}/);
assert.match(dismiss, /painelJaTemConteudo/);
const bootIdx = layout.indexOf("buildInlineCooperadoBootShellScript()");
const shellIdx = layout.indexOf('id="hb-coop-boot-shell"');
assert.ok(shellIdx >= 0 && bootIdx > shellIdx);

console.log("OK test-cooperado-abertura-v552-v560");
