/**
 * Gestão v505: F5 pinta o lastro na hora; sem defer do responsável.
 * npx tsx scripts/test-staff-gestao-f5-instantaneo-v505.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 505, "build 505+");
assert.match(read("public/sw.js"), /hb-coop-build-505/);

const cold = read("src/lib/performance/cooperadoColdStart.ts");
assert.match(cold, /F5 do responsável: sempre hidrata na hora/);
assert.match(cold, /isStaffGestaoRole\(session\?\.role\)/);
assert.doesNotMatch(cold, /NEXT_PUBLIC_STAFF_DEFER_APPDATA_EAGER/);

const warm = read("src/hooks/useEnsureAppDataWarm.ts");
assert.match(warm, /ensureAppDataEagerWarm\(\);/);
assert.match(warm, /typeof window !== "undefined"/);

const hooks = read("src/hooks/useAppData.ts");
assert.match(hooks, /peekStaffGestaoLastGood/);
assert.match(hooks, /staffPanelDataOrNull/);

const guard = read("src/lib/staff/staffGestaoSnapshotGuard.ts");
assert.match(guard, /pagehide/);
assert.match(guard, /stripBinaryForPersist/);

const staff = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.match(staff, /mostrarFilaResponsavelConteudo && data === null/);
assert.doesNotMatch(
  staff,
  /mostrarFilaResponsavelConteudo && \(data === null \|\| !isAppDataWarm\(\)\)/
);

console.log("ok: gestão F5 instantâneo v505");
