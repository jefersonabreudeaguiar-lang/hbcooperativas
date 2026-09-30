/**
 * Mensagens da aba Limites quando a base autoritativa falha.
 * npx tsx scripts/test-hb-credit-limites-staff-messages.ts
 */
import assert from "node:assert/strict";
import { mensagemAvisoBaseAuthoritativeLimites } from "../src/lib/hb-credit/hbCreditLimitesStaffMessages";

assert.equal(mensagemAvisoBaseAuthoritativeLimites(undefined), "");
assert.ok(
  mensagemAvisoBaseAuthoritativeLimites({
    code: "OPERACIONAL_UNAVAILABLE",
    message: "Snapshot operacional indisponível na nuvem.",
  }).includes("Atualizar limites")
);
assert.ok(
  mensagemAvisoBaseAuthoritativeLimites({
    code: "COOPERATIVA_NOT_FOUND",
    message: "Cooperativa não encontrada.",
  }).includes("Cooperativa")
);

console.log("OK — hb credit limites staff messages");
