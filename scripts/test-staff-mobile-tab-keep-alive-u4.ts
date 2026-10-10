import assert from "node:assert/strict";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "../src/lib/performance/staffBottomTabRoutes.ts";
import { trimStaffTabCacheOrder } from "../src/lib/performance/staffMobileTabKeepAlive.ts";
import {
  canStaffTabSwitchInstantly,
  clearStaffOptimisticTab,
  getStaffOptimisticTabSnapshot,
  reconcileStaffOptimisticTab,
  resolveStaffEffectiveTabPath,
  setStaffOptimisticTab,
} from "../src/lib/performance/staffOptimisticTabNavigation.ts";

assert.equal(staffBottomTabCacheKey("/notas-pedido"), "/notas-pedido");
assert.equal(staffBottomTabCacheKey("/relatorios/conciliacao"), "/relatorios");
assert(isStaffBottomTabPath("/ficha-corrida"));
assert(!isStaffBottomTabPath("/mercado-parceiro/cobrar"));

assert(canStaffTabSwitchInstantly("/dashboard", "/livro-caixa", "/livro-caixa"));
assert(!canStaffTabSwitchInstantly("/dashboard", "/livro-caixa", null));
assert(!canStaffTabSwitchInstantly("/dashboard", "/relatorios", "/relatorios/conciliacao"));
assert(!canStaffTabSwitchInstantly("/relatorios/conciliacao", "/relatorios", "/relatorios"));
assert(!canStaffTabSwitchInstantly("/dashboard", "/relatorios/conciliacao", "/relatorios/conciliacao"));

setStaffOptimisticTab("/dashboard", "/livro-caixa");
assert.equal(resolveStaffEffectiveTabPath("/dashboard"), "/livro-caixa");
reconcileStaffOptimisticTab("/dashboard");
assert.equal(getStaffOptimisticTabSnapshot()?.toPath, "/livro-caixa");
reconcileStaffOptimisticTab("/livro-caixa");
assert.equal(getStaffOptimisticTabSnapshot(), null);

setStaffOptimisticTab("/dashboard", "/livro-caixa");
reconcileStaffOptimisticTab("/meu-perfil");
assert.equal(getStaffOptimisticTabSnapshot(), null);
clearStaffOptimisticTab();

const order = trimStaffTabCacheOrder(
  ["/notas-pedido", "/dashboard", "/ficha-corrida", "/livro-caixa"],
  "/notas-pedido",
  2,
  false
);
assert.equal(order.length, 2);
assert.equal(order[0], "/notas-pedido");

console.log("test-staff-mobile-tab-keep-alive-u4: OK");
