/**
 * v560 — abertura como v552: splash some no mount + timeout.
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
const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");

assert.match(dismiss, /dismissCooperadoBootShell\(\);/);
assert.doesNotMatch(dismiss, /painelJaTemConteudo/);
assert.match(boot, /setTimeout\(hide,standalone\?900:1600\)/);
assert.match(auth, /cooperadoPwaInstantPaintReady\(session\)/);
assert.match(auth, /dismissCooperadoBootShell\(\)/);

console.log("OK test-cooperado-abertura-v552-v560");
