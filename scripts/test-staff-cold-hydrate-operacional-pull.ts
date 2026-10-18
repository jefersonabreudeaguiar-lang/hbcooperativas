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
assert.equal(fullFrio.pullOperacional, true);

const quente = expandStaffTierPlanIfOperacionalVazio(notasPlan, comPix, "coop1");
assert.equal(quente.pullOperacional, false);
assert.equal(quente.bidirectionalFull, false);

assert.equal(deveAdiarReconciliarFichaAposLimpezaCacheStaff(emptyInitialData), false, "sem window = servidor");

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
  /if \(plan\.pullOperacional\) await syncOperacionalFromCloud/,
  "operacional entra no pull tiered"
);

const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
assert.ok(provider.includes("expandStaffTierPlanIfOperacionalVazio"), "runSync não escolhe full a frio");
assert.ok(provider.includes("staffResponsavelOpeningSyncRequest("), "abertura passa snapshot");

const light = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
assert.ok(light.includes("staffLocalOperacionalVazio"), "light sobe para financeiro a frio");

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
assert.equal(lifeFrio?.tier, "financeiro_delta");
assert.equal(lifeFrio?.force, true);

console.log("OK — test-staff-cold-hydrate-operacional-pull");
