/**
 * HB staff: Notas/Conferir não deve disparar sync cooperativa-wide em background.
 * npx tsx scripts/test-staff-hb-sync-route.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isStaffHbCoopBackgroundSyncRoute,
  isStaffHbCoopWideSyncRoute,
} from "../src/lib/hb-credit/staffHbSyncRoute";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(isStaffHbCoopBackgroundSyncRoute("/ficha-corrida"), "ficha permite background HB");
assert(isStaffHbCoopBackgroundSyncRoute("/conta-coop"), "conta-coop permite background HB");
assert(!isStaffHbCoopBackgroundSyncRoute("/notas-pedido"), "notas NÃO dispara HB em lote");
assert(!isStaffHbCoopBackgroundSyncRoute("/cooperados"), "cooperados NÃO dispara HB em lote");

assert(!isStaffHbCoopWideSyncRoute("/notas-pedido"), "warmup HB não na rota notas");

const syncProvider = readFileSync(
  join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"),
  "utf8"
);
assert(syncProvider.includes("isStaffConferenciaModalOpen"), "sync pausa HB na Conferir");

const perms = readFileSync(join(ROOT, "src/hooks/usePermissions.ts"), "utf8");
assert(!perms.includes("useAppData()"), "usePermissions sem assinatura global AppData");

console.log("test-staff-hb-sync-route.ts done.");
