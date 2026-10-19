/**
 * Gestão v497: toque em Atualizar puxa a nuvem sem zerar o painel.
 * npx tsx scripts/test-staff-gestao-atualizar-nao-zera-v497.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";
import { expandStaffTierPlanIfOperacionalVazio } from "../src/lib/staff/staffOperacionalColdHydrate.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 497, "build 497+");
assert.match(read("public/sw.js"), /hb-coop-build-497/);

const comPix = {
  ...emptyInitialData,
  pagamentosCooperado: [{ id: "p1", cooperativaId: "coop1", status: "confirmado" } as never],
  livroCaixa: [{ id: "l1", cooperativaId: "coop1" } as never],
};

const atualizar = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("operacional_full", "staff"),
  comPix,
  "coop1",
  { staffUserInitiated: true }
);
assert.equal(atualizar.bidirectionalFull, false, "Atualizar não empurra snapshot local");
assert.equal(atualizar.pullOperacional, true, "Atualizar puxa operacional");
assert.equal(atualizar.pullNotas, true, "Atualizar puxa notas");
assert.equal(atualizar.pullContratos, true, "Atualizar puxa contratos");

const live = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("notas_delta", "staff"),
  { cooperados: [], pagamentosCooperado: [], livroCaixa: [], notasPedido: [] },
  "coop1",
  { staffLiveBackground: true }
);
assert.equal(live.bidirectionalFull, false);
assert.equal(live.pullOperacional, false, "tick leve continua sem operacional");

const chip = read("src/components/sync/SyncStatusChip.tsx");
assert.match(chip, /requestStaffGestaoAtualizar/, "botão Atualizar da gestão usa pull dedicado");
assert.doesNotMatch(chip, /StaffAtualizarButton[\s\S]*requestAppSyncImmediate/, "chip não chama bidirecional");

const syncReq = read("src/services/syncRequest.ts");
assert.match(syncReq, /export function requestStaffGestaoAtualizar/, "pedido dedicado do responsável");
assert.match(
  syncReq,
  /requestStaffGestaoAtualizar[\s\S]*userInitiated: true/,
  "Atualizar conta como toque do usuário"
);

const provider = read("src/components/sync/CooperativaSyncProvider.tsx");
assert.match(provider, /staffUserInitiated/, "runSync desliga bidirecional no toque");
assert.match(
  provider,
  /staffLiveBackground: runOpts\.staffLiveBackground === true/,
  "handler não descarta tick leve"
);

const pull = read("src/services/cooperativaSyncCloudService.ts");
assert.match(pull, /staffUserInitiated\?: boolean/, "pull aceita toque do responsável");
assert.match(
  pull,
  /opts\?\.staffUserInitiated && localRico/,
  "Atualizar com painel cheio não aplica reset operacional"
);

const conferir = read("src/components/conferir/StaffConferirProducaoBar.tsx");
assert.match(conferir, /requestStaffGestaoAtualizar/, "Atualizar agora do Conferir também é pull");

const layout = read("src/components/layout/AppLayout.tsx");
assert.match(layout, /StaffAtualizarButton/, "desktop do responsável também tem Atualizar");

console.log("ok: Atualizar do responsável puxa sem zerar (v497)");
