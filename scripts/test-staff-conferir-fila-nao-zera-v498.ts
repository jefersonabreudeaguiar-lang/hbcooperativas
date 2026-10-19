/**
 * Conferir v498: fila do cooperado reaparece; Em aberto não zera no Atualizar.
 * npx tsx scripts/test-staff-conferir-fila-nao-zera-v498.ts
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

assert.ok(APP_BUILD_VERSION >= 498, "build 498+");
assert.match(read("public/sw.js"), /hb-coop-build-498/);

const comPix = {
  ...emptyInitialData,
  pagamentosCooperado: [{ id: "p1", cooperativaId: "coop1", status: "confirmado" } as never],
  livroCaixa: [{ id: "l1", cooperativaId: "coop1" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop1", status: "pendente" } as never],
};

const atualizarQuente = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("operacional_full", "staff"),
  comPix,
  "coop1",
  { staffUserInitiated: true }
);
assert.equal(atualizarQuente.bidirectionalFull, false);
assert.equal(atualizarQuente.pullNotas, true, "Atualizar puxa notas da fila");
assert.equal(
  atualizarQuente.pullOperacional,
  false,
  "painel com PIX/ficha: Atualizar não puxa operacional (não zera Em aberto)"
);

const atualizarFrio = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("operacional_full", "staff"),
  emptyInitialData,
  "coop1",
  { staffUserInitiated: true }
);
assert.equal(atualizarFrio.pullOperacional, true, "aparelho vazio ainda hidrata operacional");
assert.equal(atualizarFrio.pullNotas, true);

const pull = read("src/services/cooperativaSyncCloudService.ts");
assert.match(pull, /skipDestructiveReset\?: boolean/, "pull operacional aceita não destruir ficha");
assert.match(pull, /retryFull: opts\?\.staffUserInitiated === true/, "Atualizar puxa notas full");
assert.match(pull, /forceNextFullNotasSync\(digits\)/, "Atualizar força full de notas");

const coalescer = read("src/lib/performance/staffNotasPullCoordinator.ts");
assert.match(coalescer, /existing && !options\?\.retryFull/, "delta em voo não engole full");
assert.match(coalescer, /options\?\.retryFull/, "full espera o delta e puxa de novo");

const conferir = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.match(
  conferir,
  /if \(!filaLocalQuente\) \{[\s\S]*recuperarFilaConferencia\(\)/,
  "fila vazia na abertura busca todas as notas na nuvem"
);
assert.match(conferir, /peekStaffGestaoLastGood/, "fila vazia reaplica lastro local");
assert.match(
  conferir,
  /filaRecuperacaoAutoRef[\s\S]*peekStaffGestaoLastGood[\s\S]*recuperarFilaConferencia/,
  "recuperação automática também restaura lastro"
);

const bar = read("src/components/conferir/StaffConferirProducaoBar.tsx");
assert.doesNotMatch(
  bar,
  /resetResponsavelPainelIndexCache/,
  "Atualizar da Conferir não apaga o lastro da tela"
);

console.log("ok: Conferir fila reaparece e Em aberto não zera (v498)");
