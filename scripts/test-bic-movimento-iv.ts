/**
 * Concerto BIC — Movimento IV (pulse, sonata, health snapshot).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBicParidadeHealthSnapshot, isBicRevisionPulseEnabled } from "../src/lib/bic/bicParidadeHealth.ts";
import { cooperadoBicFinanceiroSyncHintForUi } from "../src/lib/bic/cooperadoBicSonataSyncUi.ts";
import { bicRevisionPulseFingerprintForTests } from "../src/lib/bic/bicRevisionPulse.ts";

process.env.NEXT_PUBLIC_BIC_REVISION_PULSE = "true";
assert.equal(isBicRevisionPulseEnabled(), true);

const snap = buildBicParidadeHealthSnapshot();
assert.equal(snap.movement, "IV");
assert.equal(snap.revisionPulse, true);

assert.equal(
  cooperadoBicFinanceiroSyncHintForUi(true, {
    onFinanceiroScreen: false,
    cooperadoBicAuthority: true,
  }),
  true,
  "fora da ficha mantém hint"
);

const fp = bicRevisionPulseFingerprintForTests({
  operacionalUpdatedAt: "2026-01-01",
  operationalResetVersion: 1,
  contratosUpdatedAt: null,
  notasUpdatedAt: null,
});
assert.ok(fp.includes("2026-01-01"));

const route = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/app/api/health/bic-paridade/route.ts"),
  "utf8"
);
assert.ok(route.includes("buildBicParidadeHealthSnapshot"));

console.log("OK test-bic-movimento-iv");
