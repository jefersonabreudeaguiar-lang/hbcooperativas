/**
 * RQL 8.6 / Fase F — abas cooperado mobile (keep-alive, loading, prefetch).
 * npx tsx scripts/test-rql-cooperado-tabs-h86.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

const tabs = read("src/lib/performance/cooperadoBottomTabRoutes.ts");
const keep = read("src/lib/performance/cooperadoMobileTabKeepAlive.ts");
const prefetch = read("src/lib/hb-credit/hbCreditNavPrefetch.ts");
const navPrefetch = read("src/lib/performance/cooperadoNavPrefetch.ts");
const layout = read("src/components/layout/AppLayout.tsx");
const panel = read("src/components/performance/CooperadoMobileTabKeepAlive.tsx");
const perms = read("src/permissions/index.ts");

assert(tabs.includes('"/dashboard"') && tabs.includes('"/mensalidades"'), "5 rotas bottom tab centralizadas");
assert(keep.includes('?? "true"'), "keep-alive default ligado (8.6)");
assert(
  !keep.match(/isCooperadoMobileTabKeepAliveEnabled[\s\S]*?typeof process === \"undefined\"[\s\S]*?return false/),
  "keep-alive não desliga fail-closed no browser"
);
assert(prefetch.includes("COOPERADO_BOTTOM_TAB_HREFS"), "prefetch usa fonte única de abas");
assert(layout.includes("CooperadoMobileTabKeepAlive"), "AppLayout keep-alive cooperado");
assert(panel.includes("CooperadoTabPanelProvider"), "contexto painel ativo P0");
assert(panel.includes("data-cooperado-tab-panel"), "painéis por aba");
assert(perms.includes("cooperadoBottomTabRoutes"), "menu mobile alinhado às 5 abas");

for (const route of ["dashboard", "notas-pedido", "precos", "ficha-corrida", "mensalidades"]) {
  const loadingPath = join(ROOT, "src/app/(app)", route, "loading.tsx");
  assert(existsSync(loadingPath), `loading.tsx /${route}`);
  const loadingSrc = read(`src/app/(app)/${route}/loading.tsx`);
  assert(loadingSrc.includes("CooperadoTabRouteLoading"), `loading /${route} usa skeleton 8.6`);
}

assert(navPrefetch.includes("prefetchCooperadoTabRouteChunks"), "idle prefetch aquece chunks das 5 abas");
assert(keep.includes("COOPERADO_TAB_PIN_HREF"), "LRU pin início (P1)");
assert(existsSync(join(ROOT, "src/hooks/useCooperadoTabPanelActive.ts")), "hook painel ativo P0");
assert(existsSync(join(ROOT, "src/lib/performance/prefetchCooperadoTabRouteChunks.ts")), "prefetch chunks abas P1");
assert(existsSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx")), "chunk notas cooperado P1");
assert(read("src/app/(app)/notas-pedido/NotasPedidoContent.tsx").includes("NotasPedidoCooperadoMain"), "router notas split cooperado/staff");
assert(navPrefetch.includes("scheduleCooperadoNavPrefetchEarly"), "prefetch em camadas cooperado");
assert(navPrefetch.includes("COOPERADO_BOTTOM_TAB_HREFS"), "priority prefetch deriva das 5 abas");
for (const href of ["/dashboard", "/notas-pedido", "/precos", "/ficha-corrida", "/mensalidades"]) {
  assert(tabs.includes(`"${href}"`), `rota bottom tab ${href}`);
}

assert(existsSync(join(ROOT, "docs/performance-rql-fase-f-h86-homolog.md")), "checklist homolog 8.6");

console.log("\nOK — test-rql-cooperado-tabs-h86");
