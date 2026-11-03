import assert from "node:assert/strict";
import { calcLimiteFromPercentual } from "../src/modules/hb-credit/engine/creditBaseLimitePercentual";

assert.equal(calcLimiteFromPercentual(45,70),32,"70% de 45 centavos arredonda 31,5 para 32, sem erro binário");
for (const cents of [0,1,3,45,105,315,10001,9007199254740991]) {
  for (const basisPoints of [0,1,125,3333,5000,7000,9999,10000]) {
    const expected=Number((BigInt(cents)*BigInt(basisPoints)+BigInt(5000))/BigInt(10000));
    assert.equal(calcLimiteFromPercentual(cents,basisPoints/100),expected);
  }
}
assert.throws(()=>calcLimiteFromPercentual(100,101));
console.log("PASS: percentuais em duas casas usam centavos exatos, incluindo empates de meio centavo e valores grandes.");
