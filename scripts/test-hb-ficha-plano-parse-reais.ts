import assert from "node:assert/strict";
import { parseReaisToCentsInput } from "../src/lib/hb-credit/hbCreditFichaPlano";

assert.equal(parseReaisToCentsInput("1500"), 150_000);
assert.equal(parseReaisToCentsInput("1.500,50"), 150_050);
assert.equal(parseReaisToCentsInput("10000"), 1_000_000);
assert.equal(parseReaisToCentsInput("250,75"), 25_075);

console.log("ok: parse reais ficha plano");
