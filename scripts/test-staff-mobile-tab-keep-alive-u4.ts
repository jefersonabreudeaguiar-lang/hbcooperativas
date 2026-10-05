import assert from "node:assert/strict";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "../src/lib/performance/staffBottomTabRoutes.ts";
import { trimStaffTabCacheOrder } from "../src/lib/performance/staffMobileTabKeepAlive.ts";

assert.equal(staffBottomTabCacheKey("/notas-pedido"), "/notas-pedido");
assert.equal(staffBottomTabCacheKey("/relatorios/conciliacao"), "/relatorios");
assert(isStaffBottomTabPath("/ficha-corrida"));
assert(!isStaffBottomTabPath("/mercado-parceiro/cobrar"));

const order = trimStaffTabCacheOrder(
  ["/notas-pedido", "/dashboard", "/ficha-corrida", "/livro-caixa"],
  "/notas-pedido",
  2,
  false
);
assert.equal(order.length, 2);
assert.equal(order[0], "/notas-pedido");

console.log("test-staff-mobile-tab-keep-alive-u4: OK");
