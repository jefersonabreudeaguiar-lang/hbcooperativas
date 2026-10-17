/**
 * Troca de abas no cooperado: instantânea se o destino já está em cache;
 * A receber não recalcula com a aba Início escondida.
 * npx tsx scripts/test-cooperado-abas-instantaneas-v453.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
assert.ok(APP_BUILD_VERSION >= 453);

const fastPath = readFileSync(
  join(ROOT, "src/lib/performance/cooperadoPinnedTabFastPath.ts"),
  "utf8"
);
assert.ok(
  fastPath.includes("if (!cooperadoTabPanelCached(targetHref)) return false;"),
  "troca instantânea exige só o destino em cache"
);
assert.ok(
  !/if \(!pilotBottomTabsCachesReady\) return false;/.test(fastPath),
  "não espera as 4 abas em cache para trocar"
);

const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8"
);
assert.ok(hook.includes("tabAtiva?: boolean"), "hook recebe se a aba Início está visível");
assert.ok(
  /const gaParidadeWarm =\s*tabAtiva &&/.test(hook),
  "motor do A receber só corre com a aba Início aberta"
);
assert.ok(hook.includes("if (!tabAtiva)"), "keep-alive usa o cache sem recálculo");

const dashboard = readFileSync(
  join(ROOT, "src/app/(app)/dashboard/DashboardContent.tsx"),
  "utf8"
);
assert.ok(
  dashboard.includes("tabAtiva: tabActive"),
  "Início passa a visibilidade da aba para o card"
);

console.log("test-cooperado-abas-instantaneas-v453: OK");
