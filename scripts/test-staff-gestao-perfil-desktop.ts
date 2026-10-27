/**
 * Contrato perfil desktop gestão v1.
 * npx tsx scripts/test-staff-gestao-perfil-desktop.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { markStaffGestaoAberturaSyncConcluido } from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import {
  STAFF_GESTAO_DESKTOP_PERFIL_VERSION,
  staffGestaoPerfilAberturaSyncPermitidoForViewport,
  staffGestaoPerfilCapSyncAutomaticoForViewport,
} from "../src/lib/staff/staffGestaoPerfilDesktop.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.equal(STAFF_GESTAO_DESKTOP_PERFIL_VERSION, 12);
assert.equal(staffGestaoPerfilAberturaSyncPermitidoForViewport(true, emptyInitialData), true);
const comPixDesktop = {
  ...emptyInitialData,
  pagamentosCooperado: [{ id: "p1", cooperativaId: "coop1", status: "confirmado" } as never],
};
assert.equal(staffGestaoPerfilAberturaSyncPermitidoForViewport(true, comPixDesktop), true);
markStaffGestaoAberturaSyncConcluido();
assert.equal(staffGestaoPerfilAberturaSyncPermitidoForViewport(true, comPixDesktop), false);
assert.ok(read("src/lib/performance/cooperadoColdStart.ts").includes("preloadAppData({ eager: true })"));
assert.ok(read("src/lib/responsavel/responsavelGestaoTotais.ts").includes("getRelatorioLancamentosEmAbertoResponsavel"));
assert.ok(read("src/lib/staff/staffGestaoPainelLeitura.ts").includes("staffGestaoAppDataParaPainel"));

assert.equal(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, { tier: "operacional_full", silent: true }),
  null
);
assert.deepEqual(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, {
    tier: "financeiro_delta",
    force: true,
    silent: true,
  }),
  { tier: "financeiro_delta", force: true, silent: true }
);
assert.equal(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, { tier: "pulse", silent: true }),
  null
);
assert.deepEqual(
  staffGestaoPerfilCapSyncAutomaticoForViewport(true, { tier: "notas_delta", silent: true }),
  { tier: "notas_delta", silent: true }
);

assert.ok(read("src/hooks/useReconciliarLivroCaixaGestao.ts").includes("isStaffMobileViewportActive"));
assert.ok(read("src/lib/staff/staffGestaoPerfilDesktop.ts").includes("staffGestaoPerfilAtributosDom"));
assert.ok(read("src/lib/staff/staffGestaoPerfilDesktop.ts").includes("staffGestaoPerfilReconciliarLivroHookHabilitado"));
assert.ok(read("src/services/responsavelPainelIndex.ts").includes("preservarValoresNumericosDaFonte(data, pipeline)"));
assert.ok(read("src/services/responsavelPainelIndex.ts").includes("staffGestaoPerfilEhDesktop()"));
assert.ok(read("src/services/pagamentoIntegridadeService.ts").includes("staffGestaoPerfilEhDesktop"));
assert.ok(read("src/lib/staff/staffGestaoPerfilDesktop.ts").includes("staffGestaoPerfilReaplicarAbaLastGoodPermitido"));
assert.ok(!read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx").includes("useReconciliarLivroCaixaGestao"));
assert.ok(read("src/components/layout/AppLayout.tsx").includes("data-staff-gestao-perfil-version"));

assert.ok(read("src/lib/staff/staffGestaoModoDesktop.ts").includes("staffGestaoPerfil"));
assert.ok(read("src/components/sync/CooperativaSyncProvider.tsx").includes("staffGestaoPerfilCapSyncAutomatico"));
assert.ok(read("src/components/sync/CooperativaSyncProvider.tsx").includes("runStaffGestaoAberturaHydrateChain"));
assert.ok(read("src/components/layout/AppLayout.tsx").includes("data-staff-gestao-perfil"));

console.log("OK test-staff-gestao-perfil-desktop v", STAFF_GESTAO_DESKTOP_PERFIL_VERSION);
