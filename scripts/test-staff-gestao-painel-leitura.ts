/**
 * Painel gestão — lastro × warm e projeção Pagar.
 * npx tsx scripts/test-staff-gestao-painel-leitura.ts
 */
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  staffGestaoAppDataParaPainel,
  staffGestaoPainelDataRevisionToken,
} from "../src/lib/staff/staffGestaoPainelLeitura.ts";

assert.equal(staffGestaoPainelDataRevisionToken(), -1, "sem warm nem lastro");

const proj = staffGestaoAppDataParaPainel("coop1");
assert.equal(proj, null, "sem store warm — só lastro em runtime");

console.log("OK test-staff-gestao-painel-leitura");
