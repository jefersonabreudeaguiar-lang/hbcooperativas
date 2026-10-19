/**
 * Gestão v496: F5 persiste o painel; sync leve não zera.
 * npx tsx scripts/test-staff-gestao-f5-persiste-v496.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 496, "build 496+");
assert.match(read("public/sw.js"), /hb-coop-build-\d+/);

const cold = read("src/lib/performance/cooperadoColdStart.ts");
assert.match(cold, /persistedAppDataBlobLooksHydrated/);
assert.match(cold, /F5 com dados no aparelho/);

const store = read("src/services/dataStore.ts");
assert.match(store, /restoreStaffGestaoFromLastGoodIfNeeded/);
assert.match(store, /persistedAppDataBlobLooksHydrated/);

const guard = read("src/lib/staff/staffGestaoSnapshotGuard.ts");
assert.match(guard, /hb-staff-gestao-lkg-v1/);

const pull = read("src/services/cooperativaSyncCloudService.ts");
assert.match(pull, /staffLiveBackground\?: boolean/);
assert.match(pull, /opts\?\.staffLiveBackground/);

const provider = read("src/components/sync/CooperativaSyncProvider.tsx");
assert.match(provider, /scheduleStaffGestaoLiveSyncLoop/);
assert.match(provider, /staffResponsavelLifecycleSyncRequestLive/);
assert.doesNotMatch(provider, /requestSyncTier\("financeiro_delta"/);

console.log("ok: gestão F5 persiste e sync leve não zera (v496)");
