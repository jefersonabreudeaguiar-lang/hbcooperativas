/**
 * T1 — reconciliar livro isolado no desktop.
 * npx tsx scripts/test-staff-desktop-reconciliar-livro-isolado.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  staffGestaoPerfilReconciliarLivroCaixaAtivoForViewport,
} from "../src/lib/staff/staffGestaoPerfilDesktop.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const hook = read("src/hooks/useReconciliarLivroCaixaGestao.ts");
assert.ok(hook.includes("isStaffMobileViewportActive"));
assert.ok(hook.includes("staffGestaoPerfilReconciliarLivroCaixaAtivo"));
assert.ok(hook.includes("subscribe(agendar)"));
assert.ok(!hook.includes("staffGestaoPerfilReconciliarLivroForaDoLivroCaixa"));

assert.equal(staffGestaoPerfilReconciliarLivroCaixaAtivoForViewport(true, "/dashboard"), false);
assert.equal(staffGestaoPerfilReconciliarLivroCaixaAtivoForViewport(true, "/livro-caixa"), true);
assert.equal(staffGestaoPerfilReconciliarLivroCaixaAtivoForViewport(false, "/dashboard"), true);

const painel = read("src/services/responsavelPainelIndex.ts");
assert.ok(painel.includes("reconciliarFichaFromNotasConferidas("));
assert.ok(painel.includes("enriquecerNotaFilaComNomeGestao"));

console.log("OK test-staff-desktop-reconciliar-livro-isolado");
