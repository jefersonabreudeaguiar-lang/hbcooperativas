/**
 * P0 fail-closed HB Crédito — invariantes + fixture Cleber (sem DB/produção).
 * npm run test:hb-credit-fail-closed-p0
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calcLimiteFromPercentual } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { hbCreditEffectiveDisponivelCents } from "../src/modules/hb-credit/engine/paymentAffordability.ts";
import {
  authorizeHbFinancialLimitFailClosed,
  HB_CREDIT_LIMIT_DIVERGENT_CODE,
  HB_CREDIT_LIMIT_SNAPSHOT_MISSING_CODE,
  validateHbFinancialLimitRow,
} from "../src/modules/hb-credit/engine/hbCreditFinancialLimitInvariants.ts";
import { HB_CREDIT_STATE_STALE_CODE } from "../src/modules/hb-credit/engine/hbCreditLimitSyncState.ts";

const results: Array<{ id: string; status: "PASS" | "FAIL"; detail?: string }> = [];

function record(id: string, cond: boolean, detail?: string) {
  results.push({ id, status: cond ? "PASS" : "FAIL", detail });
  if (!cond) console.error(`FAIL ${id}${detail ? `: ${detail}` : ""}`);
}

// T1 — Cleber: B=0, L=517355, U=0, SYNCED → divergente
{
  const row = {
    limitReleasedCents: 517_355,
    capCents: 517_355,
    amountUsedCents: 0,
    baseSnapshotCents: 0,
    ceilingSnapshotCents: 517_355,
    syncState: "SYNCED",
  };
  const v = validateHbFinancialLimitRow(row);
  record("T1 Cleber B=0 L>U SYNCED", !v.ok && v.errorCode === HB_CREDIT_LIMIT_DIVERGENT_CODE);
  const auth = authorizeHbFinancialLimitFailClosed(row, 100);
  record(
    "T1 authorize blocked",
    !auth.ok && auth.errorCode === HB_CREDIT_LIMIT_DIVERGENT_CODE,
    auth.ok ? "authorized" : auth.errorCode
  );
}

// T2 — B=0, L=U → disponível 0, compra bloqueada
{
  const row = {
    limitReleasedCents: 50_000,
    capCents: 50_000,
    amountUsedCents: 50_000,
    baseSnapshotCents: 0,
    ceilingSnapshotCents: 50_000,
    syncState: "SYNCED",
  };
  const disp = hbCreditEffectiveDisponivelCents(row.limitReleasedCents, row.capCents, row.amountUsedCents);
  const auth = authorizeHbFinancialLimitFailClosed(row, 1);
  record("T2 disponivel 0", disp === 0);
  record("T2 nova compra bloqueada", !auth.ok);
}

// T3 — B>0, L>ceiling → bloqueado
{
  const base = 200_000;
  const ceiling = calcLimiteFromPercentual(base, 50);
  const row = {
    limitReleasedCents: ceiling + 10_000,
    capCents: ceiling + 10_000,
    amountUsedCents: 0,
    baseSnapshotCents: base,
    ceilingSnapshotCents: ceiling,
    syncState: "SYNCED",
  };
  const auth = authorizeHbFinancialLimitFailClosed(row, 100);
  record("T3 L>ceiling", !auth.ok && auth.errorCode === HB_CREDIT_LIMIT_DIVERGENT_CODE);
}

// T4 — B>0 coerente → authorize permitido se saldo
{
  const base = 200_000;
  const ceiling = calcLimiteFromPercentual(base, 50);
  const row = {
    limitReleasedCents: ceiling,
    capCents: ceiling,
    amountUsedCents: 0,
    baseSnapshotCents: base,
    ceilingSnapshotCents: ceiling,
    syncState: "SYNCED",
  };
  const auth = authorizeHbFinancialLimitFailClosed(row, 100);
  record("T4 coerente authorize ok", auth.ok === true);
}

// T5 — mark SYNCED falha quando incoerente (TS espelha RPC)
{
  const incoherent = validateHbFinancialLimitRow({
    limitReleasedCents: 517_355,
    capCents: 517_355,
    amountUsedCents: 0,
    baseSnapshotCents: 0,
    ceilingSnapshotCents: 517_355,
  });
  record("T5 sync fail → not SYNCED (invariant)", !incoherent.ok);
}

// T6 — prepare awaited na rota authorize
{
  const route = readFileSync(resolve("src/app/api/credit/authorize/route.ts"), "utf8");
  record(
    "T6 prepare awaited",
    /await prepareHbCreditPaymentAuthorize/.test(route) && !/void prepareHbCreditPaymentAuthorize/.test(route)
  );
  record(
    "T6 prepare failure blocks authorize",
    /if \(!prepare\.ok\)/.test(route) && /authorizePayment/.test(route)
  );
}

// T7 — STALE
{
  const row = {
    limitReleasedCents: 10_000,
    capCents: 10_000,
    amountUsedCents: 0,
    baseSnapshotCents: 100_000,
    ceilingSnapshotCents: 10_000,
    syncState: "STALE",
  };
  const auth = authorizeHbFinancialLimitFailClosed(row, 100);
  record("T7 STALE", !auth.ok && auth.errorCode === HB_CREDIT_STATE_STALE_CODE);
}

// T8 — snapshot NULL → fail-closed
{
  const v = validateHbFinancialLimitRow({
    limitReleasedCents: 0,
    capCents: 0,
    amountUsedCents: 0,
    baseSnapshotCents: null,
    ceilingSnapshotCents: null,
  });
  record("T8 snapshot NULL", !v.ok && v.errorCode === HB_CREDIT_LIMIT_SNAPSHOT_MISSING_CODE);
}

// T9 — ensure não mascara falha de sync
{
  const storage = readFileSync(resolve("src/lib/supabase/contaCoopStorage.ts"), "utf8");
  const ensureBlock = storage.slice(
    storage.indexOf("export async function ensureHbCreditLimiteAutoritativoPersistido"),
    storage.indexOf("/** Limite exibido/usado no HB")
  );
  record(
    "T9 ensure no catch on sync",
    !/syncLimitesCooperadosFromCreditoBase[\s\S]*?\.catch\(\(\) => \{\}\)/.test(ensureBlock)
  );
  record(
    "T9 ensure mark only after snapshot",
    /hbCreditAccountRowSnapshotCoherent\(refreshed\.row\)/.test(ensureBlock) &&
      /markHbCreditLimitSynced/.test(ensureBlock)
  );
}

// T10 — regressão estática: writers SYNCED + RPC authorize
{
  const storage = readFileSync(resolve("src/lib/supabase/contaCoopStorage.ts"), "utf8");
  const writeFn = storage.slice(
    storage.indexOf("async function writeLimiteCooperadoCents"),
    storage.indexOf("/** Sync autoritativo")
  );
  record(
    "T10 manual write marks STALE not SYNCED",
    /markHbCreditLimitStale/.test(writeFn) && !/markHbCreditLimitSynced/.test(writeFn)
  );
  record(
    "T10 authorize uses RPC",
    /hb_credit_authorize_payment/.test(storage)
  );
  const migration = readFileSync(
    resolve("supabase/migrations/20261001200000_hb_credit_financial_limit_snapshot_fail_closed.sql"),
    "utf8"
  );
  record(
    "T10 migration snapshot columns",
    /financial_limit_base_cents/.test(migration) && /hb_credit_validate_financial_limit_row/.test(migration)
  );
}

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\nHB fail-closed P0: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("All checks passed.");
}

assert.equal(failed.length, 0, failed.map((f) => f.id).join(", "));
