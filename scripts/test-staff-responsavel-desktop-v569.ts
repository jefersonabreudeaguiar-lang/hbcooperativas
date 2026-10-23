/**
 * Responsável no PC — abertura leve e keep-alive só no mobile.
 * npx tsx scripts/test-staff-responsavel-desktop-v569.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { staffResponsavelOpeningSyncRequest } from "../src/lib/staff/staffResponsavelSyncPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const policy = readFileSync(join(ROOT, "src/lib/staff/staffResponsavelSyncPolicy.ts"), "utf8");

assert.match(policy, /staffGestaoTemFichaOuNotaLocal/);

const comNotas = staffResponsavelOpeningSyncRequest({
  notasPedido: [{ id: "n1", cooperativaId: "c1" } as never],
  pagamentosCooperado: [],
  livroCaixa: [],
  cooperados: [],
  fichaCorrida: [],
} as never);
assert.equal(comNotas.tier, "notas_delta", "com notas locais não puxa financeiro_delta na abertura");

console.log("OK test-staff-responsavel-desktop-v569");
