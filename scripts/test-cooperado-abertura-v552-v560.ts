/**
 * v561 — cooperado igual ao backup v552 (abertura + ProtectedRoute dismiss).
 * npx tsx scripts/test-cooperado-abertura-v552-v560.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");
const dismiss = readFileSync(
  join(ROOT, "src/components/performance/CooperadoBootShellDismiss.tsx"),
  "utf8",
);
const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
const route = readFileSync(join(ROOT, "src/components/auth/ProtectedRoute.tsx"), "utf8");
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");

assert.match(dismiss, /dismissCooperadoBootShell\(\);/);
assert.doesNotMatch(dismiss, /painelJaTemConteudo/);
assert.match(boot, /if\(!standalone&&!mobile\)\{hide\(\);return;\}/);
assert.match(boot, /var ms=standalone\?900:2200/);
assert.match(boot, /setTimeout\(hide,ms\)/);
assert.match(auth, /cooperadoPwaInstantPaintReady\(session\)/);
assert.match(route, /dismissCooperadoBootShell\(\)/);
assert.doesNotMatch(route, /cooperadoGaSessionInStorage/);
assert.ok(
  !existsSync(join(ROOT, "src/components/cooperado/CooperadoPainelPaintWatchdog.tsx")),
  "watchdog v556 removido no restore v552",
);
const bootIdx = layout.indexOf("buildInlineCooperadoBootShellScript()");
const shellIdx = layout.indexOf('id="hb-coop-boot-shell"');
assert.ok(shellIdx >= 0 && bootIdx > shellIdx, "script do splash depois do HTML");

console.log("OK test-cooperado-abertura-v552-v560");
