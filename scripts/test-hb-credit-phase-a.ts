/**
 * Fase A — modo sombra vs bloqueio em divergência (sem DB).
 * npm run test:hb-credit-phase-a
 */
import assert from "node:assert/strict";
import {
  assessHbCreditPhaseAFromAccountRow,
  HB_CREDIT_RECONCILIATION_DIVERGENT_CODE,
} from "../src/modules/hb-credit/security/phaseAOperationsGuard.ts";
import {
  evaluateCreditObservation,
  buildCreditObservation,
} from "../src/lib/security/hbCreditReconciliation/rules.ts";
import { resolveHbCreditPhaseAMode } from "../src/modules/hb-credit/shared/phaseAConfig.ts";
import { HB_CREDIT_LIMIT_DIVERGENT_CODE } from "../src/modules/hb-credit/engine/hbCreditFinancialLimitInvariants.ts";

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

// Modo padrão: sombra ligada, bloqueio desligado
{
  const prevShadow = process.env.HB_CREDIT_PHASE_A_SHADOW;
  const prevBlock = process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT;
  const prevEnabled = process.env.HB_CREDIT_PHASE_A_ENABLED;
  delete process.env.HB_CREDIT_PHASE_A_SHADOW;
  delete process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT;
  delete process.env.HB_CREDIT_PHASE_A_ENABLED;
  const mode = resolveHbCreditPhaseAMode();
  ok("default enabled", mode.enabled);
  ok("default shadow", mode.shadow);
  ok("default não bloqueia", !mode.blockOnDivergent);
  if (prevShadow !== undefined) process.env.HB_CREDIT_PHASE_A_SHADOW = prevShadow;
  else delete process.env.HB_CREDIT_PHASE_A_SHADOW;
  if (prevBlock !== undefined) process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT = prevBlock;
  else delete process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT;
  if (prevEnabled !== undefined) process.env.HB_CREDIT_PHASE_A_ENABLED = prevEnabled;
  else delete process.env.HB_CREDIT_PHASE_A_ENABLED;
}

// Integridade available
{
  const obs = buildCreditObservation("62351750000165", {
    accountId: "c1",
    cooperadoId: "c1",
    limitCents: 10_000,
    usedCents: 2_000,
    availableCents: 9_000,
  }, new Date().toISOString());
  const findings = evaluateCreditObservation(obs, "t");
  ok("available mismatch detectado", findings.some((f) => f.eventType === "credit_integrity_available_mismatch"));
}

// Conta alinhada (invariante Cleber T2-style: base 0, L=U)
{
  const row = {
    limit_released_cents: 50_000,
    amount_used_cents: 50_000,
    available_cents: 0,
    financial_limit_base_cents: 0,
    financial_limit_ceiling_cents: 50_000,
    financial_limit_cap_cents: 50_000,
    financial_limit_sync_state: "SYNCED",
  };
  const a = assessHbCreditPhaseAFromAccountRow("62351750000165", "c1", row, []);
  ok("base zero L=U aligned", a.status === "ALIGNED");
}

// Divergente operacional
{
  const row = {
    limit_released_cents: 100_000,
    amount_used_cents: 0,
    available_cents: 100_000,
    financial_limit_base_cents: 200_000,
    financial_limit_ceiling_cents: 100_000,
    financial_limit_cap_cents: 100_000,
    financial_limit_sync_state: "SYNCED",
  };
  const a = assessHbCreditPhaseAFromAccountRow("62351750000165", "c1", row, [
    { kind: "limit_above_expected", message: "Limite acima do esperado." },
  ]);
  ok("operational → DIVERGENT", a.status === "DIVERGENT");
}

// Cleber T1 — base 0, limite > usado
{
  const row = {
    limit_released_cents: 517_355,
    amount_used_cents: 0,
    available_cents: 517_355,
    financial_limit_base_cents: 0,
    financial_limit_ceiling_cents: 517_355,
    financial_limit_cap_cents: 517_355,
    financial_limit_sync_state: "SYNCED",
  };
  const a = assessHbCreditPhaseAFromAccountRow("62351750000165", "c1", row, []);
  ok("Cleber invariant DIVERGENT", a.status === "DIVERGENT");
}

// Bloqueio só com flags explícitas
{
  const prevShadow = process.env.HB_CREDIT_PHASE_A_SHADOW;
  const prevBlock = process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT;
  process.env.HB_CREDIT_PHASE_A_SHADOW = "false";
  process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT = "true";
  const mode = resolveHbCreditPhaseAMode();
  ok("block mode ativo", mode.blockOnDivergent);
  if (prevShadow !== undefined) process.env.HB_CREDIT_PHASE_A_SHADOW = prevShadow;
  else delete process.env.HB_CREDIT_PHASE_A_SHADOW;
  if (prevBlock !== undefined) process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT = prevBlock;
  else delete process.env.HB_CREDIT_PHASE_A_BLOCK_DIVERGENT;
}

ok("codes exportados", Boolean(HB_CREDIT_RECONCILIATION_DIVERGENT_CODE && HB_CREDIT_LIMIT_DIVERGENT_CODE));

console.log(`\nHB Credit Fase A: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
