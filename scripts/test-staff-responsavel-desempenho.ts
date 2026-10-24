/**
 * Responsável — F5, Conferir, Pagar, Livro e troca de aba sem a nuvem/parse no 1º quadro.
 * npx tsx scripts/test-staff-responsavel-desempenho.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import {
  resolveStaffNotasPollIntervalMs,
  resolveStaffNotasPullMinIntervalMs,
} from "../src/lib/performance/staffFilaNotasLivePoll.ts";
import {
  STAFF_MOBILE_PREFETCH_HREFS,
  STAFF_NAV_PREFETCH_PRIORITY,
} from "../src/lib/performance/staffNavPrefetch.ts";
import {
  getStaffMobileTabCacheLimit,
  STAFF_TAB_PIN_HREFS,
} from "../src/lib/performance/staffMobileTabKeepAlive.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 532, "build 532+");

const store = read("src/services/dataStore.ts");
assert.match(store, /STAFF_GESTAO_PERSIST_RELOAD_IDLE_TIMEOUT_MS = 180/);
assert.ok(store.includes("requestIdleCallback"), "F5 parseia persist no idle");
assert.ok(store.includes("hydrateStaffGestaoFirstPaintFromLastro"), "F5 pinta lastro primeiro");

const poll = read("src/lib/performance/staffFilaNotasLivePoll.ts");
assert.ok(poll.includes("requestAnimationFrame(fire)"), "primeiro pull da fila após 2 frames");
assert.equal(resolveStaffNotasPollIntervalMs(true), 5_000);
assert.equal(resolveStaffNotasPullMinIntervalMs(true), 3_000);

assert.ok(STAFF_NAV_PREFETCH_PRIORITY.includes("/ficha-corrida"), "Pagar no prefetch cedo");
assert.ok(STAFF_NAV_PREFETCH_PRIORITY.includes("/livro-caixa"), "Livro no prefetch cedo");
assert.ok(STAFF_MOBILE_PREFETCH_HREFS.includes("/ficha-corrida"));

assert.equal(getStaffMobileTabCacheLimit(false), 6);
assert.equal(getStaffMobileTabCacheLimit(true), 5);
assert.deepEqual([...STAFF_TAB_PIN_HREFS], [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
]);

const keepAlive = read("src/components/performance/StaffMobileTabKeepAlive.tsx");
assert.ok(!keepAlive.includes("if (!enabled || !mobile)"), "keep-alive no desktop");

const pagar = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.ok(pagar.includes("não puxa operacional ao abrir a aba"), "Pagar não puxa operacional");

const livro = read("src/app/(app)/livro-caixa/LivroCaixaContent.tsx");
assert.ok(livro.includes("tabActive"), "Livro respeita aba visível");

const cooperados = read("src/app/(app)/cooperados/CooperadosContent.tsx");
assert.ok(cooperados.includes('useCooperadoTabPanelActive("/cooperados")'), "Cooperados pausa em background");
assert.ok(cooperados.includes("useStaffPanelAppData"), "Cooperados assina domínios estreitos");

const contaCoop = read("src/app/(app)/conta-coop/ContaCoopContent.tsx");
assert.ok(contaCoop.includes('useCooperadoTabPanelActive("/conta-coop")'), "Conta HB pausa em background");

const staffNotas = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.ok(staffNotas.includes("if (isCooperado || !tabActive) return"), "prefetch Conferir só com aba visível");

const heavy = read("src/lib/performance/staffMobileTabKeepAlive.ts");
assert.ok(heavy.includes('"/cooperados"'), "Cooperados é aba pesada no DOM");

console.log("OK — test-staff-responsavel-desempenho");
