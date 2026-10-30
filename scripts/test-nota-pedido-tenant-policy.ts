import assert from "node:assert/strict";
import { notaPedidoIdsDeOutraCooperativa } from "../src/lib/security/notaPedidoTenantPolicy.ts";

assert.deepEqual(
  notaPedidoIdsDeOutraCooperativa("11.111.111/0001-11", [
    { id: "same", cooperativa_cnpj: "11111111000111" },
  ]),
  [],
  "permite reaproveitar ID já pertencente à própria cooperativa"
);
assert.deepEqual(
  notaPedidoIdsDeOutraCooperativa("11111111000111", [
    { id: "foreign", cooperativa_cnpj: "22222222000122" },
  ]),
  ["foreign"],
  "recusa ID que já pertence a outra cooperativa"
);
assert.deepEqual(
  notaPedidoIdsDeOutraCooperativa("11111111000111", [
    { id: "same", cooperativa_cnpj: "11111111000111" },
    { id: "foreign", cooperativa_cnpj: "22222222000122" },
  ]),
  ["foreign"],
  "detecta apenas conflitos em um lote misto"
);
assert.deepEqual(
  notaPedidoIdsDeOutraCooperativa("invalido", [{ id: "any", cooperativa_cnpj: "11111111000111" }]),
  ["any"],
  "falha de forma segura quando o CNPJ de destino é inválido"
);

console.log("OK test-nota-pedido-tenant-policy (4 cenários)");
