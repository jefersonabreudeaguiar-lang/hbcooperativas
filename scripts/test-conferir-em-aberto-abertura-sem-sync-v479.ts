/**
 * Abertura local Conferir → Em aberto não dispara operacional_full.
 * npx tsx scripts/test-conferir-em-aberto-abertura-sem-sync-v479.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const staff = readFileSync(
  join(ROOT, "src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx"),
  "utf8"
);
const wrapper = readFileSync(join(ROOT, "src/components/notas/LancamentosEmAbertoPainel.tsx"), "utf8");
const view = readFileSync(join(ROOT, "src/components/notas/LancamentosEmAbertoPainelView.tsx"), "utf8");
const montar = readFileSync(join(ROOT, "src/components/notas/montarRelatorioEmAbertoConferir.ts"), "utf8");

const handler = staff.match(
  /const abrirLancamentosAbertoResponsavel = \(\) => \{[\s\S]*?\n  \};/
)?.[0];
assert.ok(handler, "handler de abertura existe");
assert.match(handler, /prefetchStaffNotasLancamentosAbertoChunk\(\)/, "prefetch preservado");
assert.doesNotMatch(
  handler,
  /resetResponsavelPainelIndexCache/,
  "abrir Em aberto não zera o lastro"
);
assert.match(handler, /setVistaResponsavel\("aberto"\)/, "transição de vista preservada");
assert.doesNotMatch(handler, /requestAppSyncImmediate/, "handler não dispara sync imediato");
assert.doesNotMatch(handler, /requestAppSync\(/, "handler não dispara sync");
assert.doesNotMatch(handler, /requestSyncTier/, "handler não pede tier de sync");

assert.doesNotMatch(
  staff,
  /useEffect\(\(\) => \{[\s\S]*?mostrarPainelLancamentosAberto[\s\S]*?requestAppSyncImmediate/,
  "efeito do painel não dispara sync"
);
assert.doesNotMatch(staff, /requestAppSyncImmediate/, "staff app sem requestAppSyncImmediate");
assert.match(
  staff,
  /mostrarPainelLancamentosAberto && coopId && relatorioEmAbertoConferir/,
  "Em aberto pinta o lastro na hora (View, sem esperar chunk)"
);
assert.match(wrapper, /montarRelatorioEmAbertoConferir/, "wrapper usa transformação existente");
assert.match(wrapper, /LancamentosEmAbertoPainelView/, "wrapper renderiza View existente");
assert.match(montar, /getRelatorioLancamentosEmAbertoResponsavel/, "transformação mantém o motor");
assert.match(view, /Valor pendente/, "View v479 intacta");
assert.doesNotMatch(wrapper, /requestAppSyncImmediate|saveDataSafe|pushOperacional/, "wrapper sem escrita");
assert.doesNotMatch(view, /requestAppSyncImmediate|saveDataSafe|pushOperacional/, "View sem escrita");

console.log("ok: abertura Em aberto sem requestAppSyncImmediate; prefetch/vista/cache e View v479 intactos");
