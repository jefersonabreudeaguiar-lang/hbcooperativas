/**
 * v562 — entrada cooperado: splash até painel; GA monta cedo; auth não some splash cedo.
 * npx tsx scripts/test-cooperado-entrada-nao-branca-v562.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const dismiss = readFileSync(
  join(ROOT, "src/components/performance/CooperadoBootShellDismiss.tsx"),
  "utf8",
);
const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
const route = readFileSync(join(ROOT, "src/components/auth/ProtectedRoute.tsx"), "utf8");
const boot = readFileSync(join(ROOT, "src/lib/performance/cooperadoBootShell.ts"), "utf8");

assert.match(dismiss, /painelJaTemConteudo/);
assert.doesNotMatch(dismiss, /useLayoutEffect\(\(\) => \{\s*dismissCooperadoBootShell\(\);\s*\}, \[\]\)/);
assert.match(auth, /path === "\/login"/);
assert.doesNotMatch(auth, /cooperadoPwaInstantPaintReady\(session\)[\s\S]{0,120}dismissCooperadoBootShell/);
assert.match(route, /cooperadoGaSessionInStorage/);
assert.match(route, /cooperadoSessionInStorage/);
assert.match(route, /loading && \(coopBootstrap/);
assert.match(dismiss, /if \(header && main\) return true/);
assert.doesNotMatch(route, /dismissCooperadoBootShell/);
assert.match(boot, /function sessUser/);
assert.doesNotMatch(boot, /setTimeout\(hide,ms\)/);

console.log("OK test-cooperado-entrada-nao-branca-v562");
