/**
 * GA motor ao vivo: Início completo após abertura (não viewUi sempre null).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dash = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/app/(app)/dashboard/DashboardContent.tsx"),
  "utf8"
);

assert.match(
  dash,
  /const viewUi = cooperadoMotorAoVivo[\s\S]*viewLive \?\? pwaInicioView \?\? pwaInicioViewStickyRef\.current/
);
assert.doesNotMatch(dash, /const viewUi = cooperadoMotorAoVivo \? null : view/);
assert.doesNotMatch(
  dash,
  /cooperadoMotorAoVivo && inicioAberturaQuieta\) return null/,
  "quiescência não pode esconder viewLive do Início completo"
);

const boot = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/lib/performance/cooperadoBootShell.ts"),
  "utf8"
);
assert.doesNotMatch(boot, /A receber/);
assert.match(boot, /Financeiro/);

console.log("OK test-cooperado-inicio-completo-ga");
