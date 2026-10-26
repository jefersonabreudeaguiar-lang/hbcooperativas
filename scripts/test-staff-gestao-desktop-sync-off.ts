/**
 * PC gestão — sem live sync / lifecycle automático (só mobile).
 * npx tsx scripts/test-staff-gestao-desktop-sync-off.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(read("src/lib/staff/staffGestaoModoDesktop.ts").includes("staffGestaoSyncBackgroundPermitido"));
assert.ok(read("src/lib/staff/staffResponsavelLiveSyncPolicy.ts").includes("staffGestaoEmViewportDesktop"));
assert.ok(read("src/components/sync/CooperativaSyncProvider.tsx").includes("staffGestaoSyncBackgroundPermitido"));

console.log("OK test-staff-gestao-desktop-sync-off");
