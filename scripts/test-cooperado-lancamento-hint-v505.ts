/**
 * v505: disparo único ao cooperado após lançamento/confirmação do responsável.
 * npx tsx scripts/test-cooperado-lancamento-hint-v505.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cooperadoIdsAfetadosPelaNota } from "../src/lib/cooperado/cooperadoLancamentoHint.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.deepEqual(
  cooperadoIdsAfetadosPelaNota({
    cooperadoId: "c1",
    divisaoEntrega: { participantes: [{ cooperadoId: "c2" }, { cooperadoId: "c1" }] },
  }),
  ["c1", "c2"]
);

const hint = read("src/lib/cooperado/cooperadoLancamentoHint.ts");
assert.match(hint, /\/api\/cooperado\/lancamento-hint/);

const api = read("src/app/api/cooperado/lancamento-hint/route.ts");
assert.match(api, /requireManagement: true/);
assert.match(api, /session\?\.role === "cooperado"/);

const nuvem = read("src/services/conferenciaDecisaoNuvemSync.ts");
assert.match(nuvem, /dispararHintCooperadosAfetados/);
assert.match(nuvem, /publishCooperadoLancamentoHint/);

const watch = read("src/hooks/useCooperadoStaffRevisionWatch.ts");
assert.match(watch, /HINT_POLL_MS = 4_000/);
assert.match(watch, /fetchMyCooperadoLancamentoHint/);
assert.match(watch, /runCooperadoMessengerOperacionalLightPull/);

const staff = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.match(staff, /publishCooperadoLancamentoHint/);

const storage = read("src/lib/supabase/cooperativaSyncStorage.ts");
assert.match(storage, /lancamento-hints\.json/);
assert.match(storage, /mergeLancamentoHintsSync/);

console.log("ok: disparo único cooperado v505");
