/**
 * Uso HB: mercado pelo nome; transferência pelo nome do cooperado.
 * npx tsx scripts/test-hb-credit-uso-descricao.ts
 */
import assert from "node:assert/strict";
import {
  formatHbCreditUsoMotivo,
  isMotivoHbUsoGenerico,
  nomeDestinoHbUso,
  preferMotivoHbUsoEspecifico,
} from "../src/lib/hb-credit/hbCreditUsoDescricao.ts";
import { preferDescontoCanonico } from "../src/lib/hb-credit/dedupeIncidenciaHbDesconto.ts";

assert.equal(nomeDestinoHbUso("Cooperado · Maria Silva"), "Maria Silva");
assert.equal(
  formatHbCreditUsoMotivo({ kind: "mercado", nome: "Mercado Central", receiptCode: "AB12CD" }),
  "Compra HB Créditos — Mercado Central (AB12CD)"
);
assert.equal(
  formatHbCreditUsoMotivo({ kind: "transferencia", nome: "Cooperado · João" }),
  "Crédito para João"
);
assert.equal(isMotivoHbUsoGenerico("Compra HB Créditos — mercado"), true);
assert.equal(isMotivoHbUsoGenerico("Compra HB Créditos — Mercado Central"), false);
assert.equal(
  preferMotivoHbUsoEspecifico("Compra HB Créditos — mercado", "Compra HB Créditos — Super Bom"),
  "Compra HB Créditos — Super Bom"
);

const generic = {
  motivo: "Compra HB Créditos — mercado",
  valorReais: 20,
  tipo: "conta_coop" as const,
  createdAt: "2026-10-20T12:00:00.000Z",
  hbTransactionId: "tx-1",
};
const named = { ...generic, motivo: "Compra HB Créditos — Super Bom" };
assert.equal(preferDescontoCanonico(generic, named).motivo, "Compra HB Créditos — Super Bom");

console.log("ok: descrição do uso HB — mercado ou cooperado");
