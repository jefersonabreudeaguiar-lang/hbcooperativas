/**
 * Toque na aba Início não pode zerar o responsável (2ª ocorrência).
 * npx tsx scripts/test-inicio-nao-zera-gestao.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { devePersistirReconciliacaoLivroCaixaGestao } from "../src/hooks/useReconciliarLivroCaixaGestao.ts";
import { staffResponsavelLifecycleSyncRequest } from "../src/lib/staff/staffResponsavelSyncPolicy.ts";
import {
  expandStaffTierPlanIfOperacionalVazio,
  markStaffOperacionalPullAplicado,
  resetStaffOperacionalColdHydrateForTests,
} from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

resetStaffOperacionalColdHydrateForTests();

assert.equal(
  devePersistirReconciliacaoLivroCaixaGestao(emptyInitialData),
  false,
  "Início não persiste AppData vazio"
);

const rico = {
  ...emptyInitialData,
  cooperados: [{ id: "c1", cooperativaId: "coop1" } as never],
  notasPedido: [{ id: "n1", cooperativaId: "coop1" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop1" } as never],
};
assert.equal(devePersistirReconciliacaoLivroCaixaGestao(rico), true);

const life = staffResponsavelLifecycleSyncRequest(emptyInitialData);
assert.equal(life?.tier, "pulse");
assert.notEqual(life?.force, true);

markStaffOperacionalPullAplicado();
const pulse = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("pulse", "staff"),
  emptyInitialData,
  "coop1"
);
assert.equal(pulse.pullOperacional, false, "toque no Início (pulse) não puxa operacional");
resetStaffOperacionalColdHydrateForTests();

const policy = readFileSync(join(ROOT, "src/lib/staff/staffResponsavelSyncPolicy.ts"), "utf8");
assert.ok(policy.includes('tier: "pulse"'), "idle/Início = pulse");
const lifeFn = policy.slice(policy.indexOf("export function staffResponsavelLifecycleSyncRequest"));
assert.ok(!lifeFn.includes('tier: "financeiro_delta"'), "lifecycle não força financeiro_delta");

const hook = readFileSync(join(ROOT, "src/hooks/useReconciliarLivroCaixaGestao.ts"), "utf8");
assert.ok(hook.includes("devePersistirReconciliacaoLivroCaixaGestao"), "hook recusa persist vazio");
assert.ok(hook.includes("temPagamentoParaLivroCaixa"), "sem PIX o Início não rebaixa ficha");

const dash = readFileSync(join(ROOT, "src/app/(app)/dashboard/DashboardContent.tsx"), "utf8");
assert.ok(dash.includes("useReconciliarLivroCaixaGestao"), "Início ainda reconcilia caixa quando há PIX");

console.log("OK — test-inicio-nao-zera-gestao");
