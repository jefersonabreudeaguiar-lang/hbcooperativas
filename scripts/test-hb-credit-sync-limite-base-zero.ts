/**
 * HB Créditos — syncLimiteCooperadoFromCreditoBase com lastro zero não altera limit_released_cents.
 * npx tsx scripts/test-hb-credit-sync-limite-base-zero.ts
 */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDisponivel } from "../src/modules/hb-credit/engine/money";
import {
  setLimiteCooperado,
  syncLimiteCooperadoFromCreditoBase,
} from "../src/lib/supabase/contaCoopStorage.ts";
import { normalizeCnpj } from "../src/utils/cooperativa.ts";

const CNPJ = "62351750000165";
const DIGITS = normalizeCnpj(CNPJ);
const COOP_ID = "c_sync_test";
const ACTOR = "test:sync-limite-base-zero";

type AccountRow = {
  id: string;
  cooperative_cnpj: string;
  cooperado_id: string;
  limit_released_cents: number;
  amount_used_cents: number;
  status: string;
  updated_at: string;
  updated_by: string;
  pin_hash?: string | null;
  pin_locked_until?: string | null;
};

type TxRow = {
  cooperative_cnpj: string;
  cooperado_id: string;
  event_type: string;
  status: string;
  amount_cents: number;
  credit_debited_cents?: number;
};

type MockState = {
  accounts: Map<string, AccountRow>;
  txs: TxRow[];
  capPercent: number;
  accountUpserts: number;
  limitWrites: number[];
};

function accKey(cooperadoId: string): string {
  return `${DIGITS}:${cooperadoId}`;
}

function createMockSupabase(state: MockState): SupabaseClient {
  const filterRows = <T extends Record<string, unknown>>(rows: T[], filters: [string, unknown][]): T[] =>
    rows.filter((row) => filters.every(([col, val]) => row[col] === val));

  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let op: "select" | "upsert" | "update" | "insert" = "select";
    let payload: unknown;
    let selectCols = "*";

    const api = {
      select(cols = "*") {
        selectCols = cols;
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return api;
      },
      upsert(row: unknown) {
        op = "upsert";
        payload = row;
        return api;
      },
      update(row: unknown) {
        op = "update";
        payload = row;
        return api;
      },
      insert(row: unknown) {
        op = "insert";
        payload = row;
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        return api.executeOne(false);
      },
      single() {
        return api.executeOne(true);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return api.executeMany().then(onFulfilled, onRejected);
      },
      async executeOne(requireRow: boolean) {
        if (table === "hb_credit_cooperative_caps") {
          if (filters.some(([c]) => c === "cooperative_cnpj")) {
            return {
              data: { global_credit_cap_percent: state.capPercent },
              error: null,
            };
          }
        }
        if (table === "hb_credit_accounts" && op === "select") {
          const row = state.accounts.get(
            accKey(String(filters.find(([c]) => c === "cooperado_id")?.[1] ?? ""))
          );
          if (!row) return { data: null, error: null };
          if (selectCols.includes("limit_released_cents") && !selectCols.includes("cooperative_cnpj")) {
            return {
              data: {
                limit_released_cents: row.limit_released_cents,
                amount_used_cents: row.amount_used_cents,
              },
              error: null,
            };
          }
          return { data: row, error: null };
        }
        if (table === "hb_credit_accounts" && op === "upsert") {
          const p = payload as Record<string, unknown>;
          const cooperadoId = String(p.cooperado_id);
          const key = accKey(cooperadoId);
          const prev = state.accounts.get(key);
          const limit = Number(p.limit_released_cents);
          state.accountUpserts += 1;
          state.limitWrites.push(limit);
          const row: AccountRow = {
            id: prev?.id ?? `acc-${cooperadoId}`,
            cooperative_cnpj: DIGITS,
            cooperado_id: cooperadoId,
            limit_released_cents: limit,
            amount_used_cents: Number(p.amount_used_cents ?? prev?.amount_used_cents ?? 0),
            status: String(p.status ?? prev?.status ?? "active"),
            updated_at: String(p.updated_at ?? new Date().toISOString()),
            updated_by: String(p.updated_by ?? ACTOR),
            pin_hash: prev?.pin_hash ?? null,
            pin_locked_until: prev?.pin_locked_until ?? null,
          };
          state.accounts.set(key, row);
          return { data: row, error: null };
        }
        if (table === "hb_credit_accounts" && op === "update") {
          const cooperadoId = String(filters.find(([c]) => c === "cooperado_id")?.[1] ?? "");
          const key = accKey(cooperadoId);
          const prev = state.accounts.get(key);
          if (prev && payload) {
            const p = payload as Record<string, unknown>;
            if (p.amount_used_cents != null) {
              prev.amount_used_cents = Number(p.amount_used_cents);
            }
            state.accounts.set(key, prev);
          }
          return { data: prev ?? null, error: null };
        }
        if (table === "hb_credit_cashback_balances") {
          return { data: null, error: null };
        }
        if (requireRow) return { data: null, error: { message: "not found" } };
        return { data: null, error: null };
      },
      async executeMany() {
        if (table === "hb_credit_transactions" && op === "select") {
          const rows = filterRows(state.txs, filters);
          return { data: rows, error: null };
        }
        if (table === "hb_credit_accounts" && op === "select") {
          const rows = filterRows([...state.accounts.values()], filters);
          if (selectCols === "limit_released_cents") {
            return {
              data: rows.map((r) => ({ limit_released_cents: r.limit_released_cents })),
              error: null,
            };
          }
          return { data: rows, error: null };
        }
        return { data: [], error: null };
      },
    };
    return api;
  };

  return { from: builder } as unknown as SupabaseClient;
}

function seedAccount(state: MockState, cooperadoId: string, limit: number, usado: number): void {
  state.accounts.set(accKey(cooperadoId), {
    id: `acc-${cooperadoId}`,
    cooperative_cnpj: DIGITS,
    cooperado_id: cooperadoId,
    limit_released_cents: limit,
    amount_used_cents: usado,
    status: "active",
    updated_at: new Date().toISOString(),
    updated_by: ACTOR,
  });
}

function readLimit(state: MockState, cooperadoId: string): number {
  return state.accounts.get(accKey(cooperadoId))?.limit_released_cents ?? 0;
}

async function main() {
// TESTE 1 — limite 500 + usado 0 + base 0 → limite continua 500
{
  const state: MockState = {
    accounts: new Map(),
    txs: [],
    capPercent: 100,
    accountUpserts: 0,
    limitWrites: [],
  };
  seedAccount(state, COOP_ID, 50_000, 0);
  const supabase = createMockSupabase(state);
  const beforeUpserts = state.accountUpserts;
  const r = await syncLimiteCooperadoFromCreditoBase(supabase, CNPJ, COOP_ID, 0, ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unexpected");
  assert.equal(r.action, "unchanged");
  assert.equal(r.limite.limiteLiberadoCents, 50_000);
  assert.equal(readLimit(state, COOP_ID), 50_000);
  assert.equal(state.accountUpserts, beforeUpserts, "sync base 0 não deve gravar conta");
}

// TESTE 2 — limite 500 + usado 100 + base 0 → limite 500, disponível 400
{
  const state: MockState = {
    accounts: new Map(),
    txs: [],
    capPercent: 100,
    accountUpserts: 0,
    limitWrites: [],
  };
  seedAccount(state, COOP_ID, 50_000, 10_000);
  const supabase = createMockSupabase(state);
  const r = await syncLimiteCooperadoFromCreditoBase(supabase, CNPJ, COOP_ID, 0, ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unexpected");
  assert.equal(r.limite.limiteLiberadoCents, 50_000);
  assert.equal(r.limite.valorUsadoCents, 10_000);
  assert.equal(r.limite.valorDisponivelCents, computeDisponivel(50_000, 10_000));
  assert.equal(readLimit(state, COOP_ID), 50_000);
}

// TESTE 3 — sem conta + base 0 → não cria limite
{
  const state: MockState = {
    accounts: new Map(),
    txs: [],
    capPercent: 100,
    accountUpserts: 0,
    limitWrites: [],
  };
  const supabase = createMockSupabase(state);
  const r = await syncLimiteCooperadoFromCreditoBase(supabase, CNPJ, COOP_ID, 0, ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unexpected");
  assert.equal(state.accounts.size, 0);
  assert.equal(r.limite.limiteLiberadoCents, 0);
  assert.equal(r.action, "unchanged");
}

// TESTE 4 — alteração explícita 500 → 300
{
  const state: MockState = {
    accounts: new Map(),
    txs: [],
    capPercent: 100,
    accountUpserts: 0,
    limitWrites: [],
  };
  seedAccount(state, COOP_ID, 50_000, 0);
  const supabase = createMockSupabase(state);
  const manual = await setLimiteCooperado(supabase, CNPJ, COOP_ID, 30_000, ACTOR, {
    [COOP_ID]: 1_000_000,
  });
  assert.equal(manual.ok, true);
  if (!manual.ok) throw new Error("unexpected");
  assert.equal(readLimit(state, COOP_ID), 30_000);
  assert.equal(manual.limite.limiteLiberadoCents, 30_000);
}

// TESTE 5 — estorno: sync base 0 após uso registrado não reduz limite
{
  const state: MockState = {
    accounts: new Map(),
    txs: [],
    capPercent: 100,
    accountUpserts: 0,
    limitWrites: [],
  };
  seedAccount(state, COOP_ID, 50_000, 10_000);
  state.txs.push({
    cooperative_cnpj: DIGITS,
    cooperado_id: COOP_ID,
    event_type: "PAYMENT",
    status: "reversed",
    amount_cents: 10_000,
    credit_debited_cents: 10_000,
  });
  const supabase = createMockSupabase(state);
  const r = await syncLimiteCooperadoFromCreditoBase(supabase, CNPJ, COOP_ID, 0, ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unexpected");
  assert.equal(readLimit(state, COOP_ID), 50_000);
  assert.equal(r.limite.limiteLiberadoCents, 50_000);
}

console.log("OK — syncLimiteCooperadoFromCreditoBase blindagem lastro zero (5 cenários)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
