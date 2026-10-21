import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "../src/lib/performance/staffBottomTabRoutes.ts";
import {
  getStaffMobileTabCacheLimit,
  STAFF_TAB_PIN_HREFS,
  trimStaffTabCacheOrder,
} from "../src/lib/performance/staffMobileTabKeepAlive.ts";

assert.equal(staffBottomTabCacheKey("/notas-pedido"), "/notas-pedido");
assert.equal(staffBottomTabCacheKey("/relatorios/conciliacao"), "/relatorios");
assert(isStaffBottomTabPath("/ficha-corrida"));
assert(!isStaffBottomTabPath("/mercado-parceiro/cobrar"));
assert.equal(getStaffMobileTabCacheLimit(false), 4);
assert.equal(getStaffMobileTabCacheLimit(true), 2);
assert.deepEqual([...STAFF_TAB_PIN_HREFS], ["/notas-pedido", "/ficha-corrida"]);

const order = trimStaffTabCacheOrder(
  ["/notas-pedido", "/dashboard", "/ficha-corrida", "/livro-caixa"],
  "/notas-pedido",
  2,
  false
);
assert.equal(order.length, 2);
assert.equal(order[0], "/notas-pedido");
assert.ok(order.includes("/ficha-corrida"), "Pagar fica pinado no limite 2");

const quatro = trimStaffTabCacheOrder(
  ["/dashboard", "/notas-pedido", "/ficha-corrida", "/livro-caixa"],
  "/livro-caixa",
  4,
  false
);
assert.equal(quatro.length, 4);
assert.ok(quatro.includes("/notas-pedido"));
assert.ok(quatro.includes("/ficha-corrida"));
assert.ok(quatro.includes("/livro-caixa"));

const keepAliveUi = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/components/performance/StaffMobileTabKeepAlive.tsx"),
  "utf8"
);
assert.ok(keepAliveUi.includes("if (!enabled)"), "keep-alive também no desktop");
assert.ok(!keepAliveUi.includes("if (!enabled || !mobile)"), "não desliga keep-alive no PC");
assert.ok(keepAliveUi.includes("if (!enabled || !onTab)"), "desktop também grava o painel no cache");

console.log("test-staff-mobile-tab-keep-alive-u4: OK");
