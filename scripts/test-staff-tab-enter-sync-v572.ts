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
assert.match(tab, /scheduleSessionOperacionalHydrate/);
assert.match(tab, /operacional_full/);
assert.match(tab, /pullConferirNotasSeFilaVazia/);
assert.match(tab, /recuperarFilaConferenciaResponsavelDaNuvem/);
assert.match(
  tab,
  /scheduleStaffPostInteractiveTask\(\(\) => \{[\s\S]*?path\.startsWith\("\/notas-pedido"\)[\s\S]*?staffResponsavelPausaSyncPesado/
);
assert.ok(!tab.includes("lightTierForTab"), "sync por aba só Conferir (notas_delta) + hidratação no Início");
assert.match(tab, /OPERACIONAL_HYDRATE_DELAY_MS/);
assert.match(tab, /dashboardInicioHydrateDone/);
assert.match(tab, /inicioDuranteWarmupPc/);
assert.match(tab, /scheduleStaffGestaoPersistReloadAfterPaint/);
assert.match(sync, /reloadStaffGestaoPersistAfterFirstPaint\(\)/);
assert.match(layout, /StaffGestaoTabEnterSync/);

console.log("OK test-staff-tab-enter-sync-v572");
