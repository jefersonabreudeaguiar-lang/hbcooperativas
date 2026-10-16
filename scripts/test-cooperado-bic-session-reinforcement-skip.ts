/**
 * Movimento II — skip de reforço BIC quando revisão já aplicada + remat recente.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COOPERADO_BIC_SESSION_REMATERIALIZE_TTL_MS } from "../src/lib/cooperado/cooperadoBicSessionReinforcementSkip.ts";

const session = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoBicMobileSessionSync.ts"),
  "utf8"
);
assert.ok(session.includes("shouldSkipCooperadoBicSessionReinforcementPull"));
assert.ok(session.includes("awaitCooperadoGaSyncBaseInformacoesFinanceirasInflight"));

assert.equal(COOPERADO_BIC_SESSION_REMATERIALIZE_TTL_MS, 90_000);

const skipMod = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoBicSessionReinforcementSkip.ts"),
  "utf8"
);
assert.ok(skipMod.includes("cloudRevisionChangedSinceApplied"));

console.log("OK test-cooperado-bic-session-reinforcement-skip");
