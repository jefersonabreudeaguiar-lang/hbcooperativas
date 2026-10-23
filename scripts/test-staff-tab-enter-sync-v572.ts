/**
 * Gestão — sync leve ao entrar na aba.
 * npx tsx scripts/test-staff-tab-enter-sync-v572.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const tab = readFileSync(join(ROOT, "src/lib/staff/staffResponsavelTabEnterSync.ts"), "utf8");
const sync = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
const layout = readFileSync(join(ROOT, "src/components/layout/AppLayout.tsx"), "utf8");

assert.match(tab, /scheduleStaffResponsavelTabEnterSync/);
assert.match(tab, /notas_delta/);
assert.match(tab, /financeiro_delta/);
assert.match(tab, /syncTiersForTab/);
assert.match(tab, /dashboardInicioHydrateDone/);
assert.match(tab, /inicioDuranteWarmupPc/);
assert.match(tab, /reloadStaffGestaoPersistAfterFirstPaint/);
assert.match(sync, /reloadStaffGestaoPersistAfterFirstPaint\(\)/);
assert.match(layout, /StaffGestaoTabEnterSync/);

console.log("OK test-staff-tab-enter-sync-v572");
