/**
 * Fase B — antifraude HB (sombra, step-up, bloqueio alto).
 * npm run test:hb-credit-phase-b
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessHbCreditPhaseBPaymentRisk,
  HB_CREDIT_STEP_UP_REQUIRED_CODE,
} from "../src/modules/hb-credit/security/phaseBOperationsGuard.ts";
import { resolveHbCreditPhaseBMode } from "../src/modules/hb-credit/shared/phaseBConfig.ts";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    return;
  }
  passed += 1;
}

const baseMode = resolveHbCreditPhaseBMode({
  HB_CREDIT_PHASE_B_ENABLED: "true",
  HB_CREDIT_PHASE_B_SHADOW: "true",
});

ok("default B enabled", baseMode.enabled);
ok("default B shadow", baseMode.shadow);
ok("default B sem enforce", !baseMode.enforceStepUp);

{
  const clear = assessHbCreditPhaseBPaymentRisk(
    {
      amountCents: 5_000,
      availableCents: 100_000,
      payments15m: 0,
      volume24hCents: 10_000,
      firstPaymentToPartner: false,
    },
    baseMode
  );
  ok("pagamento rotineiro CLEAR", clear.status === "CLEAR");
}

{
  const elevated = assessHbCreditPhaseBPaymentRisk(
    {
      amountCents: 250_000,
      availableCents: 300_000,
      payments15m: 0,
      volume24hCents: 0,
      firstPaymentToPartner: true,
    },
    baseMode
  );
  ok("valor alto + mercado novo → ELEVATED ou HIGH", elevated.status !== "CLEAR");
}

{
  const high = assessHbCreditPhaseBPaymentRisk(
    {
      amountCents: 250_000,
      availableCents: 260_000,
      payments15m: 5,
      volume24hCents: 400_000,
      firstPaymentToPartner: false,
    },
    baseMode
  );
  ok("velocidade + valor → HIGH", high.status === "HIGH");
}

{
  const enforceMode = resolveHbCreditPhaseBMode({
    HB_CREDIT_PHASE_B_ENABLED: "true",
    HB_CREDIT_PHASE_B_SHADOW: "false",
    HB_CREDIT_PHASE_B_ENFORCE: "true",
  });
  ok("enforce step-up ligado", enforceMode.enforceStepUp);
  ok("step-up code exportado", HB_CREDIT_STEP_UP_REQUIRED_CODE === "HB_CREDIT_STEP_UP_REQUIRED");
}

const root = resolve(import.meta.dirname ?? __dirname, "..");
const storage = readFileSync(resolve(root, "src/lib/supabase/contaCoopStorage.ts"), "utf8");
assert.match(storage, /runHbCreditPhaseBPaymentGuard/, "authorize chama guard Fase B");

console.log(`\nFase B: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
console.log("OK: contrato HB Créditos Fase B");
