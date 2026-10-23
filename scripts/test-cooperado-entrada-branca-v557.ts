/**
 * v557 — entrada do app nunca fica branca (purge recarrega + splash até pintar).
 * npx tsx scripts/test-cooperado-entrada-branca-v557.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const silent = readFileSync(join(ROOT, "src/lib/pwa/cooperadoPwaSilentRepairInline.ts"), "utf8");
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");
const dismiss = readFileSync(
  join(ROOT, "src/components/performance/CooperadoBootShellDismiss.tsx"),
  "utf8",
);
const route = readFileSync(join(ROOT, "src/components/auth/ProtectedRoute.tsx"), "utf8");

assert.match(silent, /function hbCoopSilentPwaPurgeThen/);
assert.match(silent, /hbCoopSilentPwaPurgeThen\(next\)/);
assert.doesNotMatch(silent, /hbCoopSilentPwaPurge\(\);return;}/);
assert.doesNotMatch(boot, /PWA_REPAIR_SESSION_KEY/);
assert.match(boot, /pwa-rescue\.html\?auto=1/);
assert.match(dismiss, /painelJaTemConteudo/);
assert.doesNotMatch(dismiss, /dismissCooperadoBootShell\(\);\s*const t1/);
assert.doesNotMatch(route, /cooperadoGaSessionInStorage\(\) && \(!user \|\| loading/);

console.log("OK test-cooperado-entrada-branca-v557");
