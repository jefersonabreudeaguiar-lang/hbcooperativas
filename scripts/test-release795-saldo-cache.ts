import assert from "node:assert/strict";
import type { ContaCoopLimiteCooperado } from "../src/modules/hb-credit/types";
import { mergeHbPaymentLimiteForScan, normalizeHbPaymentLimiteDisponivel, canAffordHbPaymentWithLimite } from "../src/modules/hb-credit/engine/paymentAffordability";

const fresh: ContaCoopLimiteCooperado = { id:"account",cooperativaCnpj:"88888888000181",cooperadoId:"member",limiteLiberadoCents:50000,valorUsadoCents:0,valorDisponivelCents:20000,cashbackDisponivelCents:100,bloqueado:false,updatedAt:"2026-11-06T13:00:00Z" };
const old = {...fresh,valorDisponivelCents:50000,cashbackDisponivelCents:9000,updatedAt:"2026-11-06T12:00:00Z"};
assert.equal(normalizeHbPaymentLimiteDisponivel(fresh).valorDisponivelCents,20000);
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh,old),fresh);
assert.deepEqual(mergeHbPaymentLimiteForScan(old,fresh),fresh);
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh,{...old,cooperadoId:"other",updatedAt:"2026-11-06T14:00:00Z"}),fresh);
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh,{...old,cooperativaCnpj:"99999999000191",updatedAt:"2026-11-06T14:00:00Z"}),fresh);
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh,{...old,updatedAt:"invalid"}),fresh);
assert.equal(canAffordHbPaymentWithLimite({...fresh,bloqueado:true},100,false),false);
console.log("PASS 795: saldo recente e teto preservados; cache de outra conta recusado; conta bloqueada não paga.");
