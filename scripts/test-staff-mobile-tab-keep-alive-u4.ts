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
assert.equal(getStaffMobileTabCacheLimit(false), 6);
assert.equal(getStaffMobileTabCacheLimit(true), 5);
assert.deepEqual(
  [...STAFF_TAB_PIN_HREFS],
  ["/dashboard", "/notas-pedido", "/ficha-corrida", "/livro-caixa"]
);

const order = trimStaffTabCacheOrder(
  ["/notas-pedido", "/dashboard", "/ficha-corrida", "/livro-caixa"],
  "/notas-pedido",
  4,
  true
);
assert.equal(order.length, 4);
assert.equal(order[0], "/notas-pedido");
assert.ok(order.includes("/ficha-corrida"), "Pagar fica pinado");
assert.ok(order.includes("/livro-caixa"), "Livro fica pinado");

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
assert.ok(keepAliveUi.includes("if (!enabled || !mobile)"), "keep-alive só no mobile gestão");
assert.ok(keepAliveUi.includes("useStaffMobileViewport"), "desktop rota única sem 4 painéis");
assert.ok(keepAliveUi.includes("return [activeKey]"), "só uma aba no DOM por vez");

console.log("test-staff-mobile-tab-keep-alive-u4: OK");
