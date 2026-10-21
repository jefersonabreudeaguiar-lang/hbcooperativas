/**
 * Ctrl+F5 no Livro Caixa não pode puxar operacional vazio nem gravar AppData pobre.
 * npx tsx scripts/test-livro-caixa-ctrl-f5-nao-zera.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";
import {
  expandStaffTierPlanIfOperacionalVazio,
  resetStaffOperacionalColdHydrateForTests,
  staffPrecisaHydrateOperacionalPull,
} from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import { staffResponsavelOpeningSyncRequest } from "../src/lib/staff/staffResponsavelSyncPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

resetStaffOperacionalColdHydrateForTests();

const comFichaSemPix = {
  ...emptyInitialData,
  notasPedido: [{ id: "n1", cooperativaId: "coop1" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop1", status: "pendente" } as never],
};

assert.equal(staffPrecisaHydrateOperacionalPull(comFichaSemPix, "coop1"), true);
assert.equal(staffResponsavelOpeningSyncRequest(comFichaSemPix).tier, "financeiro_delta");

const fin = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("financeiro_delta", "staff"),
  comFichaSemPix,
  "coop1"
);
assert.equal(fin.pullOperacional, true, "F5 com ficha e sem PIX puxa o backup da nuvem");
assert.equal(fin.bidirectionalFull, false);

const caixa = readFileSync(join(ROOT, "src/app/(app)/livro-caixa/LivroCaixaContent.tsx"), "utf8");
assert.ok(!caixa.includes("requestAppSyncLight"), "Livro Caixa não dispara sync leve no mount");
assert.ok(caixa.includes("useReconciliarLivroCaixaGestao"), "só reconcilia caixa com guarda");
assert.match(caixa, /resolveGestaoCooperativaId/, "Livro caixa acha a cooperativa pelo CNPJ da sessão");
assert.match(caixa, /Abrindo o livro da cooperativa/, "não some a tela enquanto o lastro chega");
assert.ok(caixa.includes("flushStaffGestaoLastGoodNow"), "salvar grava lastro na hora");
assert.ok(caixa.includes("getDataOperationalTruth"), "publicar manda o livro da memória, não a view");
assert.ok(
  !/useEffect\(\(\) => \{\s*if \(!data \|\| !coopId\) return;\s*const aligned = posProcessar/.test(caixa),
  "não grava posProcessar sem guarda no F5"
);

const cold = readFileSync(join(ROOT, "src/lib/performance/cooperadoColdStart.ts"), "utf8");
assert.ok(cold.includes("hydrateStaffGestaoFirstPaintFromLastro"), "F5 do responsável pinta lastro primeiro");
assert.ok(
  !/isStaffGestaoRole\(session\?\.role\) \{\s*preloadAppData\(\{ eager: true \}\)/.test(cold),
  "F5 do responsável não parseia o persist no primeiro quadro"
);

const syncCloud = readFileSync(join(ROOT, "src/services/cooperativaSyncCloudService.ts"), "utf8");
assert.ok(syncCloud.includes("peekStaffGestaoLastGood"), "Atualizar une lastro no livro da nuvem");
assert.ok(syncCloud.includes("preservarStaffGestaoContraWipe(data"), "finalize do pull não apaga manual");

const light = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
assert.ok(!light.includes("financeiro_delta"), "sync leve nunca vira financeiro_delta");

console.log("OK — test-livro-caixa-ctrl-f5-nao-zera");
