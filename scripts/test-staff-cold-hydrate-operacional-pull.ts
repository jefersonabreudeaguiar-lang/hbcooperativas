/**
 * Gestão após limpeza de cache: pull operacional sem push do snapshot vazio.
 * npx tsx scripts/test-staff-cold-hydrate-operacional-pull.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";
import {
  deveAdiarReconciliarFichaAposLimpezaCacheStaff,
  expandStaffTierPlanIfOperacionalVazio,
  resetStaffOperacionalColdHydrateForTests,
  staffLocalOperacionalVazio,
  staffPrecisaHydrateOperacionalPull,
  staffOperacionalPullJaAplicado,
  markStaffOperacionalPullAplicado,
} from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import {
  staffResponsavelLifecycleSyncRequest,
  staffResponsavelOpeningSyncRequest,
} from "../src/lib/staff/staffResponsavelSyncPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

resetStaffOperacionalColdHydrateForTests();

assert.equal(staffLocalOperacionalVazio(null), true);
assert.equal(staffLocalOperacionalVazio(emptyInitialData), true);
assert.equal(staffPrecisaHydrateOperacionalPull(emptyInitialData), true);

const soNotas = {
  ...emptyInitialData,
  notasPedido: [{ id: "n1", cooperativaId: "coop1" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop1", status: "pendente" } as never],
};
assert.equal(staffLocalOperacionalVazio(soNotas, "coop1"), true, "fichas pendente sem PIX = frio");
assert.equal(
  staffPrecisaHydrateOperacionalPull(soNotas, "coop1"),
  true,
  "F5 com ficha/nota e sem PIX puxa o operacional da nuvem"
);

const comPix = {
  ...emptyInitialData,
  pagamentosCooperado: [{ id: "p1", cooperativaId: "coop1", status: "confirmado" } as never],
};
assert.equal(staffLocalOperacionalVazio(comPix, "coop1"), false);

const comLivro = {
  ...emptyInitialData,
  livroCaixa: [{ id: "l1", cooperativaId: "coop1" } as never],
};
assert.equal(staffLocalOperacionalVazio(comLivro, "coop1"), false);

const openingFrio = staffResponsavelOpeningSyncRequest(emptyInitialData);
assert.equal(openingFrio.tier, "financeiro_delta");
assert.equal(openingFrio.force, true);

const openingQuente = staffResponsavelOpeningSyncRequest(comPix);
assert.equal(openingQuente.tier, "notas_delta");
assert.notEqual(openingQuente.force, true);

const notasPlan = resolveSyncTierPlan84("notas_delta", "staff");
assert.equal(notasPlan.pullOperacional, false);
const hydrate = expandStaffTierPlanIfOperacionalVazio(notasPlan, emptyInitialData, "coop1");
assert.equal(hydrate.pullOperacional, true);
assert.equal(hydrate.pullNotas, true);
assert.equal(hydrate.pullContratos, true);
assert.equal(hydrate.bidirectionalFull, false);

const fullPlan = resolveSyncTierPlan84("operacional_full", "staff");
assert.equal(fullPlan.bidirectionalFull, true);
const fullFrio = expandStaffTierPlanIfOperacionalVazio(fullPlan, soNotas, "coop1");
assert.equal(fullFrio.bidirectionalFull, false, "full a frio não empurra snapshot pobre");
assert.equal(fullFrio.pullOperacional, true, "ficha sem PIX: F5 puxa o backup da nuvem");

const vazioTotal = expandStaffTierPlanIfOperacionalVazio(fullPlan, emptyInitialData, "coop1");
assert.equal(vazioTotal.pullOperacional, true, "aparelho vazio ainda hidrata uma vez");
assert.equal(vazioTotal.bidirectionalFull, false);

const quente = expandStaffTierPlanIfOperacionalVazio(notasPlan, comPix, "coop1");
assert.equal(quente.pullOperacional, false);
assert.equal(quente.bidirectionalFull, false);

const atualizarQuente = expandStaffTierPlanIfOperacionalVazio(fullPlan, comPix, "coop1", {
  staffUserInitiated: true,
});
assert.equal(atualizarQuente.bidirectionalFull, false, "Atualizar nunca empurra o aparelho");
assert.equal(atualizarQuente.pullOperacional, true, "Atualizar puxa PIX/ficha");
assert.equal(atualizarQuente.pullNotas, true, "Atualizar puxa notas");
assert.equal(atualizarQuente.pullContratos, true, "Atualizar puxa contratos");

assert.equal(deveAdiarReconciliarFichaAposLimpezaCacheStaff(emptyInitialData), false, "sem window = servidor");
assert.equal(
  deveAdiarReconciliarFichaAposLimpezaCacheStaff(soNotas as never, "coop1"),
  false,
  "ficha já local — não esconde o responsável"
);

markStaffOperacionalPullAplicado();
assert.equal(staffOperacionalPullJaAplicado(), true);
resetStaffOperacionalColdHydrateForTests();
assert.equal(staffOperacionalPullJaAplicado(), false);

const policy = readFileSync(join(ROOT, "src/lib/staff/staffResponsavelSyncPolicy.ts"), "utf8");
assert.ok(policy.includes("staffPrecisaHydrateOperacionalPull"), "abertura detecta frio");

const syncSvc = readFileSync(join(ROOT, "src/services/cooperativaSyncCloudService.ts"), "utf8");
assert.ok(syncSvc.includes("expandStaffTierPlanIfOperacionalVazio"), "pull staff expande a frio");
assert.ok(syncSvc.includes("staffLocalOperacionalVazio"), "bidirecional não dá push a frio");
assert.ok(syncSvc.includes("markStaffOperacionalPullAplicado"), "marca pull aplicado");
assert.match(
  syncSvc,
  /if \(pullOperacional\) await syncOperacionalFromCloud/,
  "operacional entra no pull tiered"
);
assert.match(
  syncSvc,
  /ensureCloudOperationalResetApplied\(digits, coopId\)/,
  "reset da nuvem no F5 não fica sem merge"
);
assert.match(
  syncSvc,
  /staffLiveBackground[\s\S]*ensureCloudOperationalResetApplied/,
  "tick leve não aplica reset operacional"
);

const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
assert.ok(provider.includes("expandStaffTierPlanIfOperacionalVazio"), "runSync não escolhe full a frio");
assert.ok(provider.includes("staffResponsavelOpeningSyncRequest("), "abertura passa snapshot");

const light = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
assert.ok(light.includes('requestSyncTier("notas_delta"'), "light não sobe para operacional");
assert.ok(!light.includes("staffPrecisaHydrateOperacionalPull"), "light não força financeiro no F5");

const projetar = readFileSync(
  join(ROOT, "src/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase.ts"),
  "utf8"
);
assert.ok(
  projetar.includes("deveAdiarReconciliarFichaAposLimpezaCacheStaff"),
  "não fabrica ficha pendente antes do pull"
);

const cap = readFileSync(join(ROOT, "src/lib/performance/staffConferenciaSyncTier.ts"), "utf8");
assert.ok(cap.includes("staffLocalOperacionalVazio"), "Conferir não rebaixa hydrate a frio");

const resetSrc = readFileSync(join(ROOT, "src/services/operationalReset.ts"), "utf8");
assert.ok(
  resetSrc.includes("primeiroAparelhoOuCacheLimpo"),
  "reset vazio após cache limpo não publica wipe"
);

const lifeFrio = staffResponsavelLifecycleSyncRequest(emptyInitialData);
assert.equal(lifeFrio?.tier, "pulse", "idle/Início não puxa operacional — abertura hidrata");
assert.notEqual(lifeFrio?.force, true);

markStaffOperacionalPullAplicado();
assert.equal(
  staffPrecisaHydrateOperacionalPull(emptyInitialData),
  true,
  "F5 com PIX/livro vazios puxa de novo — sessionStorage não bloqueia"
);
const notasAposPull = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("notas_delta", "staff"),
  emptyInitialData,
  "coop1"
);
assert.equal(notasAposPull.pullOperacional, true, "abertura notas_delta a frio hidrata operacional");
const pulseAposPull = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("pulse", "staff"),
  emptyInitialData,
  "coop1"
);
assert.equal(pulseAposPull.pullOperacional, false, "idle/Início pulse não puxa operacional");
resetStaffOperacionalColdHydrateForTests();

console.log("OK — test-staff-cold-hydrate-operacional-pull");
