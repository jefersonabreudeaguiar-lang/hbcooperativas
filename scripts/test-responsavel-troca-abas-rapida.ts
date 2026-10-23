/**
 * Troca de abas do responsável — lastro na hora, sem remount no toque.
 * npx tsx scripts/test-responsavel-troca-abas-rapida.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESPONSAVEL_TROCA_ABAS_PIN_DO_DIA,
  RESPONSAVEL_TROCA_ABAS_RAPIDA_VERSION,
  RESPONSAVEL_TROCA_ABAS_TRABALHO_PESADO_NO_IDLE,
  RESPONSAVEL_TROCA_ABAS_USA_CACHE_KEEP_ALIVE,
} from "../src/lib/responsavel/responsavelTrocaAbasRapida.ts";
import {
  getStaffMobileTabCacheLimit,
  STAFF_TAB_PIN_HREFS,
  trimStaffTabCacheOrder,
} from "../src/lib/performance/staffMobileTabKeepAlive.ts";
import {
  resolveStaffEffectiveTabPath,
  setStaffOptimisticTab,
  clearStaffOptimisticTab,
} from "../src/lib/performance/staffOptimisticTabNavigation.ts";
import { tryStaffCachedInstantTabSwitch } from "../src/lib/performance/staffPinnedTabFastPath.ts";
import { staffTabCacheMayWriteForPath } from "../src/lib/performance/staffTabPanelCache.ts";

assert.equal(RESPONSAVEL_TROCA_ABAS_RAPIDA_VERSION, 4);
assert.equal(RESPONSAVEL_TROCA_ABAS_USA_CACHE_KEEP_ALIVE, true);
assert.equal(RESPONSAVEL_TROCA_ABAS_TRABALHO_PESADO_NO_IDLE, true);
assert.deepEqual([...RESPONSAVEL_TROCA_ABAS_PIN_DO_DIA], [...STAFF_TAB_PIN_HREFS]);
assert.equal(getStaffMobileTabCacheLimit(false), 6);
assert.equal(getStaffMobileTabCacheLimit(true), 5);

const pinados = trimStaffTabCacheOrder(
  ["/dashboard", "/notas-pedido", "/ficha-corrida", "/livro-caixa", "/conta-coop"],
  "/conta-coop",
  5,
  true
);
assert.equal(pinados.length, 5);
assert.ok(pinados.includes("/conta-coop"));
assert.ok(pinados.includes("/notas-pedido"));
assert.ok(pinados.includes("/ficha-corrida"));
assert.ok(pinados.includes("/livro-caixa"));

clearStaffOptimisticTab();
assert.equal(resolveStaffEffectiveTabPath("/notas-pedido"), "/notas-pedido");
setStaffOptimisticTab("/ficha-corrida");
assert.equal(resolveStaffEffectiveTabPath("/notas-pedido"), "/ficha-corrida");
clearStaffOptimisticTab();

assert.equal(
  tryStaffCachedInstantTabSwitch("/notas-pedido", "/ficha-corrida"),
  false,
  "sem cache não troca no vazio"
);

assert.equal(
  staffTabCacheMayWriteForPath({ pathChanged: true, childrenUnchanged: true, childrenIsLoading: false }),
  false,
  "não grava children da aba anterior na chave nova"
);
assert.equal(
  staffTabCacheMayWriteForPath({ pathChanged: false, childrenUnchanged: false, childrenIsLoading: false }),
  true
);

const keepAlive = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/components/performance/StaffMobileTabKeepAlive.tsx"),
  "utf8"
);
assert.ok(keepAlive.includes("useStaffEffectiveTabPath"), "keep-alive usa caminho otimista");
assert.ok(keepAlive.includes("markStaffTabPathChange"), "keep-alive marca quiescence na troca");
assert.ok(keepAlive.includes("STAFF_TAB_HEAVY_HREFS"), "keep-alive limita painéis pesados no DOM");
assert.ok(keepAlive.includes("useDeferredValue"), "keep-alive adia commit pesado do Next");
assert.ok(keepAlive.includes("mobileViewport"), "keep-alive só no mobile — desktop navega direto");

const staffPath = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/hooks/useStaffEffectiveTabPath.ts"),
  "utf8"
);
assert.match(staffPath, /isStaffGestaoMobileViewport\(\)\) return canonical/);
const layout = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/components/layout/AppLayout.tsx"),
  "utf8"
);
assert.ok(layout.includes("staffDesktopSidebarNav ? pathname"), "PC remonta rota no menu lateral");
assert.ok(keepAlive.includes("registerStaffTabPanelCacheProbe"), "keep-alive publica o cache");
assert.ok(!keepAlive.includes("{children ?? <PageSkeleton compact />}\n      {renderInactivePanels()}"));
assert.ok(layout.includes("tryStaffCachedInstantTabSwitch"), "toque do responsável pinta o lastro");
assert.ok(layout.includes("setStaffOptimisticTab"), "otimista só no ramo staff");
assert.ok(layout.includes("tryCooperadoPinnedInstantTabSwitch"), "ramo cooperado intacto");

console.log("ok: troca de abas do responsável pinta o lastro na hora");
