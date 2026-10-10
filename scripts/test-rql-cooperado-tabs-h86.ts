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
const rootLayout = read("src/app/layout.tsx");
const layout = read("src/components/layout/AppLayout.tsx");
const panel = read("src/components/performance/CooperadoMobileTabKeepAlive.tsx");
const perms = read("src/permissions/index.ts");

assert(
  tabs.includes('"/dashboard"') && tabs.includes('"/ficha-corrida"') && !tabs.includes('"/mensalidades"'),
  "4 rotas bottom tab centralizadas (mensalidades no menu)"
);
assert(keep.includes('?? "true"'), "keep-alive default ligado (8.6)");
assert(
  !keep.match(/isCooperadoMobileTabKeepAliveEnabled[\s\S]*?typeof process === \"undefined\"[\s\S]*?return false/),
  "keep-alive não desliga fail-closed no browser"
);
assert(prefetch.includes("COOPERADO_BOTTOM_TAB_HREFS"), "prefetch usa fonte única de abas");
assert(rootLayout.includes("data-cooperado-tab-keep-alive"), "html expõe flag keep-alive cooperado");
assert(rootLayout.includes("data-cooperado-tab-dom-policy"), "html expõe política DOM abas cooperado");
assert(layout.includes("CooperadoMobileTabKeepAlive"), "AppLayout keep-alive cooperado");
assert(panel.includes("useSyncExternalStore"), "viewport mobile sync no 1º paint");
assert(panel.includes("data-cooperado-tab-panel"), "painéis por aba");
assert(panel.includes("data-cooperado-tab-panel-warm"), "painel warm para paint instantâneo");
assert(panel.includes("cooperadoTabPanelCache"), "cache não sobrescreve com loading.tsx");
assert(
  panel.includes("[content-visibility:hidden]") && panel.includes("hrefsMountedInDom.map"),
  "keep-alive monta só painéis necessários no DOM (inert)"
);
assert(
  panel.includes('active === "/notas-pedido"') && panel.includes("COOPERADO_PINNED_TAB_HREFS"),
  "notas isolada; início+financeiro dual-mount"
);
assert(layout.includes("router.push(item.href)"), "cooperado força push na troca de aba");
assert(
  read("src/lib/performance/cooperadoPinnedTabFastPath.ts").includes(
    "NEXT_PUBLIC_COOPERADO_PINNED_DUAL_MOUNT"
  ),
  "rollback env Início+Financeiro dual mount"
);
assert(layout.includes("scheduleCooperadoPinnedTabsEagerWarm"), "warm antecipado Início+Financeiro");
assert(
  read("src/lib/performance/cooperadoPinnedTabFastPath.ts").includes(
    "tryCooperadoPinnedInstantTabSwitch"
  ),
  "troca Início↔Financeiro sem router.push quando cache pronto"
);
assert(read("src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx").includes("useCooperadoPanelAppData"), "notas pausa store fora da aba");
assert(
  read("src/lib/cooperado/cooperadoPwaMobileEntregas.ts").includes(
    "isCooperadoPwaMobileEntregasSyncDeferUntilEnvio"
  ),
  "PWA cooperado: sync notas adiado até envio"
);
assert(
  read("src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx").includes("ensureCooperadoNotasFreshForEnvio"),
  "sync de notas só no fluxo de envio (PWA cooperado)"
);
assert(
  read("src/lib/cooperado/cooperadoPwaLeveUi.ts").includes("isCooperadoPwaMobileEntregasLeve"),
  "PWA leve: snapshot + AppData na aba ativa"
);
assert(
  read("src/lib/cooperado/cooperadoPwaInstantResume.ts").includes("cooperadoPwaInstantPaintReady"),
  "abertura PWA instantanea antes do AppData warm"
);
assert(
  read("src/lib/cooperado/cooperadoPwaMessengerMode.ts").includes("isCooperadoPwaMessengerMode"),
  "modo mensageiro PWA cooperado"
);
assert(
  read("src/lib/cooperado/cooperadoPwaMessengerMode.ts").includes("persistirCooperadoPwaMessengerCaches"),
  "snapshots gravados apos sync pontual"
);
assert(
  existsSync(join(ROOT, "src/components/cooperado/CooperadoPwaResumeLifecycle.tsx")),
  "persist snapshots ao ir para segundo plano"
);
assert(panel.includes("useCooperadoEffectiveTabPath"), "navegação otimista cooperado");
assert(layout.includes("setCooperadoOptimisticTab"), "pointerdown otimista no rodapé");
assert(layout.includes("cooperadoTabWarmOnTouchStart"), "touchstart aquece chunk no rodapé");
assert(keep.includes("return 2") && keep.includes("PWA: LRU 2"), "PWA mensageiro LRU 2 slots");
assert(
  read("src/lib/performance/cooperadoMobileTabDomPolicy.ts").includes("279-financeiro-paint"),
  "política DOM cooperado versionada"
);
assert(
  read("src/lib/performance/prefetchCooperadoTabRouteChunks.ts").includes(
    "warmCooperadoAdjacentTabRouteChunks"
  ),
  "aquecimento de abas vizinhas após troca"
);
assert(perms.includes("cooperadoBottomTabRoutes"), "menu mobile alinhado às 4 abas");
assert(perms.includes('href: "/mensalidades"') && perms.includes("COOPERADO_DRAWER_MENU"), "mensalidades no menu lateral");

for (const route of ["dashboard", "notas-pedido", "precos", "ficha-corrida"]) {
  const loadingPath = join(ROOT, "src/app/(app)", route, "loading.tsx");
  assert(existsSync(loadingPath), `loading.tsx /${route}`);
  const loadingSrc = read(`src/app/(app)/${route}/loading.tsx`);
  assert(loadingSrc.includes("CooperadoTabRouteLoading"), `loading /${route} usa skeleton 8.6`);
}

assert(navPrefetch.includes("prefetchCooperadoTabRouteChunks"), "idle prefetch aquece chunks das abas");
assert(keep.includes("COOPERADO_TAB_PIN_HREF"), "LRU pin início (P1)");
assert(existsSync(join(ROOT, "src/hooks/useCooperadoTabPanelActive.ts")), "hook painel ativo P0");
assert(existsSync(join(ROOT, "src/lib/performance/prefetchCooperadoTabRouteChunks.ts")), "prefetch chunks abas P1");
assert(existsSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx")), "chunk notas cooperado P1");
assert(read("src/app/(app)/notas-pedido/NotasPedidoContent.tsx").includes("NotasPedidoCooperadoMain"), "router notas split cooperado/staff");
assert(navPrefetch.includes("scheduleCooperadoNavPrefetchEarly"), "prefetch em camadas cooperado");
assert(navPrefetch.includes("COOPERADO_BOTTOM_TAB_HREFS"), "priority prefetch deriva das abas do rodapé");
for (const href of ["/dashboard", "/notas-pedido", "/precos", "/ficha-corrida"]) {
  assert(tabs.includes(`"${href}"`), `rota bottom tab ${href}`);
}

assert(existsSync(join(ROOT, "docs/performance-rql-fase-f-h86-homolog.md")), "checklist homolog 8.6");

console.log("\nOK — test-rql-cooperado-tabs-h86");
