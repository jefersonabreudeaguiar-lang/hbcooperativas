/**
 * Contrato perfil desktop gestão v1.
 * npx tsx scripts/test-staff-gestao-perfil-desktop.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STAFF_GESTAO_DESKTOP_PERFIL_VERSION,
  staffGestaoPerfilCapSyncAutomaticoForViewport,
} from "../src/lib/staff/staffGestaoPerfilDesktop.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.equal(STAFF_GESTAO_DESKTOP_PERFIL_VERSION, 2);

assert.equal(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, { tier: "operacional_full", silent: true }),
  null
);
assert.equal(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, {
    tier: "financeiro_delta",
    force: true,
    silent: true,
  }),
  null
);
assert.equal(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, { tier: "pulse", silent: true }),
  null
);

assert.ok(read("src/hooks/useReconciliarLivroCaixaGestao.ts").includes("staffGestaoPerfilEhDesktop"));
assert.ok(read("src/hooks/useReconciliarLivroCaixaGestao.ts").includes("pathEhLivroCaixa"));

assert.ok(read("src/lib/staff/staffGestaoModoDesktop.ts").includes("staffGestaoPerfil"));
assert.ok(read("src/components/sync/CooperativaSyncProvider.tsx").includes("staffGestaoPerfilCapSyncAutomatico"));
assert.ok(read("src/components/layout/AppLayout.tsx").includes("data-staff-gestao-perfil"));

console.log("OK test-staff-gestao-perfil-desktop v", STAFF_GESTAO_DESKTOP_PERFIL_VERSION);
