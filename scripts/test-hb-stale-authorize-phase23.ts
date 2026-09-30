/**
 * Fase 2.3 — bloqueio STALE no authorize (modelo + invariantes).
 * npm run test:hb-stale-authorize
 */
import assert from "node:assert/strict";
import { calcLimiteFromPercentual } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { HB_CREDIT_STATE_STALE_CODE } from "../src/modules/hb-credit/engine/hbCreditLimitSyncState.ts";
import {
  authorizeHb,
  runInterleavedScenario,
  type HbAccountState,
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

function scenario(steps: InterleaveStep[]) {
  return runInterleavedScenario({
    name: "phase23",
    tetoPercent: TETO,
    initialBaseCents: BASE,
    steps,
    staleGuard: true,
  });
}

// T1 — Pagamento → STALE → authorize
{
  const r = scenario([
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "authorize", grossCents: LIMITE },
  ]);
  const staleStep = r.snapshots.find((s) => s.hb.financialLimitSyncState === "STALE");
  record(
    "T1 payment→STALE→authorize",
    r.authorizeFailCount === 1 &&
      r.authorizeOkCount === 0 &&
      r.final.hb.amountUsedCents === 0 &&
      Boolean(staleStep)
      ? "PASS"
      : "FAIL",
    `ok=${r.authorizeOkCount} fail=${r.authorizeFailCount} used=${r.final.hb.amountUsedCents}`
  );
}

// T2 — Pagamento → sync → authorize (limite zerado)
{
  const r = scenario([
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "sync_hb" },
    { kind: "authorize", grossCents: 100 },
  ]);
  record(
    "T2 payment→sync→authorize",
    r.authorizeFailCount === 1 &&
      r.final.hb.financialLimitSyncState === "SYNCED" &&
      r.final.hb.limitReleasedCents === 0
      ? "PASS"
      : "FAIL",
    `limit=${r.final.hb.limitReleasedCents} state=${r.final.hb.financialLimitSyncState}`
  );
}

// T3 — Sync falha (modelo: sync não executado → permanece STALE)
{
  const r = scenario([{ kind: "payment_persist", fullSettlementCents: BASE }]);
  record(
    "T3 sync falha → STALE",
    r.final.hb.financialLimitSyncState === "STALE" ? "PASS" : "FAIL",
    `state=${r.final.hb.financialLimitSyncState}`
  );
}

// T4 — Retry sync → SYNCED
{
  const r = scenario([
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "sync_hb" },
  ]);
  record(
    "T4 retry sync → SYNCED",
    r.final.hb.financialLimitSyncState === "SYNCED" ? "PASS" : "FAIL",
    `state=${r.final.hb.financialLimitSyncState}`
  );
}

// T5 — 10 authorize simultâneos em STALE (sequencial no modelo)
{
  let hb: HbAccountState = {
    limitReleasedCents: LIMITE,
    amountUsedCents: 0,
    financialLimitSyncState: "STALE",
  };
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    const r = authorizeHb(hb, 1000, { enforceSyncState: true });
    if (r.ok) ok++;
    hb = r.hb;
  }
  record(
    "T5 10× authorize STALE",
    ok === 0 && hb.amountUsedCents === 0 ? "PASS" : "FAIL",
    `ok=${ok} used=${hb.amountUsedCents}`
  );
}

// T6 — 10× authorize SYNCED (FOR UPDATE preservado no RPC real; modelo serial)
{
  let hb: HbAccountState = {
    limitReleasedCents: LIMITE,
    amountUsedCents: 0,
    financialLimitSyncState: "SYNCED",
  };
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    const r = authorizeHb(hb, 1000, { enforceSyncState: true });
    if (r.ok) ok++;
    else break;
    hb = r.hb;
  }
  record(
    "T6 10× authorize SYNCED (modelo serial)",
    ok === 10 && hb.amountUsedCents === 10_000 ? "PASS" : "FAIL",
    `ok=${ok} used=${hb.amountUsedCents}`
  );
}

// T7 — Refund em STALE (refund RPC não alterado — modelo documental)
record(
  "T7 refund em STALE",
  "SKIP",
  "hb_credit_refund_payment não consulta financial_limit_sync_state; comportamento preservado por escopo."
);

// T8 — Replay authorize stale sem efeito financeiro
{
  const hb: HbAccountState = {
    limitReleasedCents: LIMITE,
    amountUsedCents: 0,
    financialLimitSyncState: "STALE",
  };
  const k = "same-idempotency";
  void k;
  const a = authorizeHb(hb, 5000, { enforceSyncState: true });
  const b = authorizeHb(a.hb, 5000, { enforceSyncState: true });
  record(
    "T8 replay stale authorize",
    !a.ok && !b.ok && b.hb.amountUsedCents === 0 ? "PASS" : "FAIL",
    `used=${b.hb.amountUsedCents}`
  );
}

// T9 — Pagamento + authorize intercalado (authorize após persist, antes sync)
{
  const r = scenario([
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "authorize", grossCents: LIMITE },
    { kind: "sync_hb" },
  ]);
  record(
    "T9 payment+authorize race",
    r.authorizeOkCount === 0 && r.final.hb.amountUsedCents === 0 ? "PASS" : "FAIL",
    `ok=${r.authorizeOkCount} used=${r.final.hb.amountUsedCents}`
  );
}

// T10 — Cron (detecção ≠ recuperação)
record(
  "T10 falha sync + cron",
  "SKIP",
  "/api/cron/credit-reconciliation detecta divergência; não chama sync-limite (Fase 2.2). Recuperação via confirmar-pagamento retry ou sync-limite manual."
);

// Cenário crítico Fase 2.3
{
  const r = scenario([
    { kind: "payment_persist", fullSettlementCents: BASE },
    { kind: "authorize", grossCents: LIMITE },
  ]);
  const auth = authorizeHb(
    { ...r.final.hb, financialLimitSyncState: "STALE" },
    LIMITE,
    { enforceSyncState: true }
  );
  record(
    "CRITICAL paid+stale+authorize",
    r.authorizeFailCount === 1 && auth.errorCode === HB_CREDIT_STATE_STALE_CODE ? "PASS" : "FAIL",
    `code=${auth.errorCode}`
  );
}

console.log("\n--- Fase 2.3 test results ---");
for (const r of results) {
  console.log(`${r.status} ${r.id}${r.detail ? ` — ${r.detail}` : ""}`);
}

const failed = results.filter((r) => r.status === "FAIL");
assert.equal(failed.length, 0, `${failed.length} test(s) failed`);
