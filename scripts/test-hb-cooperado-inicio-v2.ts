import assert from "node:assert/strict";
import { hbCreditCooperadoInicioV2Totais } from "../src/lib/hb-credit/hbCreditCooperadoInicioV2";

const totais = hbCreditCooperadoInicioV2Totais({
  id: "a1",
  cooperativaCnpj: "62351750000165",
  cooperadoId: "c1",
  manualValorBrutoCents: 10_000,
  limiteLiberadoCents: 8_000,
  valorUsadoCents: 2_000,
  valorDisponivelCents: 6_000,
  bloqueado: false,
  updatedAt: "",
});

assert.ok(totais);
assert.equal(totais!.brutoFichaCents, 10_000);
assert.equal(totais!.aReceberCents, 8_000);
assert.equal(totais!.usadoCents, 2_000);

console.log("ok: hb cooperado inicio v2 totais");
