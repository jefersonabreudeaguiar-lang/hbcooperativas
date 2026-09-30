/**
 * Fase 2.2 — prova de concorrência pagamento × authorize HB (modelo + invariantes).
 * npm run test:concurrency-payment-hb
 */
import assert from "node:assert/strict";
import { calcLimiteFromPercentual } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import {
  assertInvariants,
  detectStaleLimitConsumption,
  monteCarloPaymentVsAuthorize,
  runInterleavedScenario,
  syncHbLimitFromAuthoritative,
  type InterleaveStep,
} from "../archived/hobelisco-lab/scripts-lab/paymentHbConcurrencyModel.ts";

const results: Array<{ id: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string }> = [];

function record(id: string, status: "PASS" | "FAIL" | "SKIP", detail?: string) {
  results.push({ id, status, detail });
  if (status === "FAIL") console.error(`FAIL ${id}${detail ? `: ${detail}` : ""}`);
}

const TETO = 50;
const BASE = 200_000;
const LIMITE = calcLimiteFromPercentual(BASE, TETO);

function scenario(name: string, steps: InterleaveStep[]) {
  return runInterleavedScenario({
    name,
    tetoPercent: TETO,
    initialBaseCents: BASE,
    steps,
  });
}

// Cenário 1 — pagamento persistido, authorize ANTES sync (janela T1–T2)
{
  const r = scenario("A→authorize→sync", [
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "authorize", grossCents: LIMITE },
    { kind: "sync_hb" },
  ]);
  const det = detectStaleLimitConsumption(r.final);
  const inv = assertInvariants(r.final.hb);
  record(
    "C1 payment→authorize→sync",
    r.authorizeOkCount === 1 && det.staleAuthorizePossible && inv.ok ? "PASS" : "FAIL",
    `authorizeOk=${r.authorizeOkCount} stale=${det.staleAuthorizePossible} used=${r.final.hb.amountUsedCents}`
  );
}

// Cenário 2 — sync antes authorize (deve recusar compra no limite zerado)
{
  const r = scenario("A→sync→authorize", [
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "sync_hb" },
    { kind: "authorize", grossCents: LIMITE },
  ]);
  record(
    "C2 payment→sync→authorize",
    r.authorizeFailCount === 1 && r.final.hb.amountUsedCents === 0 ? "PASS" : "FAIL",
    `fail=${r.authorizeFailCount} used=${r.final.hb.amountUsedCents}`
  );
}

// Cenário extremo R$2000 / 50% / compra R$1000 durante janela
{
  const r = scenario("extreme-stale-window", [
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "authorize", grossCents: LIMITE },
    { kind: "sync_hb" },
  ]);
  record(
    "C5 extreme paid+full HB buy in window",
    r.final.operacional.creditoBaseAuthoritativeCents === 0 &&
      r.final.hb.amountUsedCents === LIMITE &&
      r.authorizeOkCount === 1
      ? "PASS"
      : "FAIL",
    `base=${r.final.operacional.creditoBaseAuthoritativeCents} used=${r.final.hb.amountUsedCents}`
  );
}

// Cenário 3/4 — ordens invertidas Monte Carlo 500×
{
  const mc = monteCarloPaymentVsAuthorize(500);
  record(
    "C3/C4 Monte Carlo 500 interleavings",
    mc.invariantBreaks === 0 ? "PASS" : "FAIL",
    `staleSuccess=${mc.staleSuccesses} invariantBreaks=${mc.invariantBreaks}`
  );
  record(
    "C3/C4 stale authorize when base=0 before sync",
    mc.staleSuccesses > 0 ? "PASS" : "FAIL",
    `count=${mc.staleSuccesses}`
  );
}

// Pagamento aguardando (base authoritative 0, limite HB stale) — janela maior
{
  const r = scenario("awaiting-register-then-authorize", [
    { kind: "payment_awaiting_register" },
    { kind: "authorize", grossCents: LIMITE },
  ]);
  record(
    "awaiting window authorize on stale limit",
    r.authorizeOkCount === 1 && r.final.operacional.creditoBaseAuthoritativeCents === 0 ? "PASS" : "FAIL"
  );
}

// Pagamento parcial — arquitetura representa base/limit (sem API parcial)
{
  let opBase = BASE;
  const afterPay = Math.max(0, opBase - 50_000);
  const limExp = calcLimiteFromPercentual(afterPay, TETO);
  const hb = syncHbLimitFromAuthoritative(
    { limitReleasedCents: LIMITE, amountUsedCents: 0 },
    afterPay,
    TETO
  );
  record(
    "C6 partial base architecture",
    afterPay === 150_000 && limExp === 75_000 && hb.limitReleasedCents === 75_000 ? "PASS" : "FAIL"
  );
}

// Sync falha — operacional confirmado, HB não sincronizado
{
  const r = scenario("sync-skipped-after-payment", [
    { kind: "payment_persist", fullSettlementCents: BASE },
  ]);
  record(
    "C7 sync failure leaves stale limit",
    r.final.operacional.creditoBaseAuthoritativeCents === 0 &&
      r.final.hb.limitReleasedCents === LIMITE
      ? "PASS"
      : "FAIL"
  );
}

// Retry idempotente (sync duas vezes)
{
  const r = scenario("double-sync", [
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "sync_hb" },
    { kind: "sync_hb" },
  ]);
  record(
    "C3 duplicate sync",
    r.final.hb.limitReleasedCents === 0 && r.final.hb.amountUsedCents === 0 ? "PASS" : "FAIL"
  );
}

// 10 authorize simultâneos (modelo sequencial = soma se limite permitir)
{
  const steps: InterleaveStep[] = Array.from({ length: 10 }, () => ({
    kind: "authorize" as const,
    grossCents: 10_000,
  }));
  const r = runInterleavedScenario({
    name: "10-authorize",
    tetoPercent: TETO,
    initialBaseCents: BASE,
    steps,
  });
  const inv = assertInvariants(r.final.hb);
  record(
    "C12 ten authorize sequential model",
    inv.ok && r.final.hb.amountUsedCents <= LIMITE ? "PASS" : "FAIL",
    `used=${r.final.hb.amountUsedCents}`
  );
}

// Escala 100 cooperados (isolados)
{
  let breaks = 0;
  for (let i = 0; i < 100; i++) {
    const r = scenario(`coop-${i}`, [
      { kind: "payment_persist", fullSettlementCents: BASE },
      { kind: "authorize", grossCents: LIMITE },
      { kind: "sync_hb" },
    ]);
    if (!assertInvariants(r.final.hb).ok) breaks++;
  }
  record("C13 scale 100 cooperados", breaks === 0 ? "PASS" : "FAIL", `breaks=${breaks}`);
}

// Idempotência authorize (modelo: mesma compra não duplica se falhar após sync)
record("C12 HB SQL idempotency", "SKIP", "requer Postgres; RPC unchanged");

record("C7 cron recovery", "SKIP", "cron só detecta — ver relatório");

record("C10 refund", "SKIP", "RPC não alterada");

record("C13 500 ops load", "SKIP", "modelo discreto; sem pool Postgres");

// Veredito automático do modelo
const staleWindowProven = results.some(
  (r) => r.id.includes("C1") || r.id.includes("stale") || r.id.includes("extreme")
) && results.every((r) => r.status !== "FAIL" || r.id.startsWith("SKIP"));

console.log("\n--- Fase 2.2 concurrency model ---");
for (const r of results) {
  console.log(`${r.status.padEnd(5)} ${r.id}${r.detail ? ` (${r.detail})` : ""}`);
}

const fails = results.filter((r) => r.status === "FAIL").length;
console.log(`\nTotal: ${results.filter((r) => r.status === "PASS").length} PASS, ${fails} FAIL, ${results.filter((r) => r.status === "SKIP").length} SKIP`);

assert.equal(fails, 0, "concurrency model failures");
console.log("\nModelo: janela stale com consumo indevido REPRODUZÍVEL quando authorize ocorre antes do sync HB.");
console.log("Veredito sugerido pelo modelo: 🟠 RISK (consumo HB com base authoritative 0); SQL mantém amount_used <= limit.");
