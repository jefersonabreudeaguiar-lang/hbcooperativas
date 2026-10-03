/**
 * HX 8.1 — smoke de arquivos RQL render (sem browser)
 * npx tsx scripts/test-render-rql-h81.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

const layout = readFileSync(join(ROOT, "src/components/layout/AppLayout.tsx"), "utf8");
assert(!layout.includes("useAppData()"), "AppLayout sem useAppData()");
assert(layout.includes("useAppShellNavigation"), "AppLayout usa useAppShellNavigation");

const dash = readFileSync(join(ROOT, "src/app/(app)/dashboard/page.tsx"), "utf8");
assert(!dash.includes("useAppData()"), "dashboard sem useAppData()");

const hook = readFileSync(join(ROOT, "src/hooks/useResponsavelFilaConferencia.ts"), "utf8");
assert(!hook.includes("data: AppData | null"), "fila conferência sem prop data");
assert(hook.includes("getDataRevision"), "fila conferência usa revision");

const list = readFileSync(join(ROOT, "src/components/notas/ResponsavelFilaCooperadosList.tsx"), "utf8");
assert(list.includes("VIRTUALIZE_MIN_ROWS"), "lista fila com virtualização");

console.log("\nHX 8.1 render smoke OK");
