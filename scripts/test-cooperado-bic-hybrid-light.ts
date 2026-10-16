/**
 * BIC híbrido leve: reforços por revisão de nuvem + flag de produção.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCooperadoBicHybridLightEnabled } from "../src/lib/cooperado/cooperadoBicHybridLight.ts";

process.env.NEXT_PUBLIC_COOPERADO_BIC_HYBRID_LIGHT = "true";
assert.equal(isCooperadoBicHybridLightEnabled(), true);
process.env.NEXT_PUBLIC_COOPERADO_BIC_HYBRID_LIGHT = "false";
assert.equal(isCooperadoBicHybridLightEnabled(), false);

const session = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoBicMobileSessionSync.ts"),
  "utf8"
);
assert.ok(session.includes("light: true"));
assert.ok(session.includes("hybridLight"));

const gaBase = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync.ts"),
  "utf8"
);
assert.ok(gaBase.includes("cloudRevisionChangedSinceApplied"));
assert.ok(gaBase.includes("lightReconcile"));

const vercel = readFileSync(join(import.meta.dirname ?? __dirname, "../vercel.json"), "utf8");
assert.ok(vercel.includes('"NEXT_PUBLIC_COOPERADO_BIC_HYBRID_LIGHT": "true"'));

console.log("OK test-cooperado-bic-hybrid-light");
