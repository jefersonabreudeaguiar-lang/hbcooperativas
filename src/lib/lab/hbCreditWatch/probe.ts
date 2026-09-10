import { getStagingSupabaseClient } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import type { CreditAccountRow } from "./types";
import { assertAllowedTable, assertReadOnlyOperation } from "./safety";

const TABLE = "hb_credit_accounts";

export async function readCreditAccountsReadOnly(coopCnpj: string): Promise<{
  ok: true;
  accounts: CreditAccountRow[];
} | {
  ok: false;
  error: string;
}> {
  assertReadOnlyOperation(`SELECT FROM ${TABLE}`);
  assertAllowedTable(TABLE);

  const client = getStagingSupabaseClient();
  if (!client) {
    return { ok: false, error: "staging_supabase_not_configured" };
  }

  const digits = coopCnpj.replace(/\D/g, "");
  if (digits.length !== 14) {
    return { ok: false, error: "invalid_cnpj" };
  }

  const { data, error } = await client
    .from(TABLE)
    .select("cooperado_id, limit_released_cents, amount_used_cents, available_cents")
    .eq("cooperative_cnpj", digits)
    .limit(500);

  if (error) {
    return { ok: false, error: error.message };
  }

  const accounts: CreditAccountRow[] = (data ?? []).map((row, idx) => {
    const cooperadoId = String(row.cooperado_id ?? "");
    return {
      accountId: cooperadoId || `account_${idx}`,
      cooperadoId,
      limitCents: Number(row.limit_released_cents),
      usedCents: Number(row.amount_used_cents),
      availableCents: Number(row.available_cents),
    };
  });

  for (const acc of accounts) {
    if (!Number.isFinite(acc.limitCents) || !Number.isFinite(acc.usedCents) || !Number.isFinite(acc.availableCents)) {
      return { ok: false, error: "invalid_numeric_field" };
    }
  }

  return { ok: true, accounts };
}

/** Versão in-memory para testes unitários do audit */
export function readCreditAccountsFromRows(rows: Array<{
  cooperado_id: string;
  limit_released_cents: number;
  amount_used_cents: number;
  available_cents: number;
}>): CreditAccountRow[] {
  return rows.map((row, idx) => ({
    accountId: row.cooperado_id || `account_${idx}`,
    cooperadoId: row.cooperado_id,
    limitCents: row.limit_released_cents,
    usedCents: row.amount_used_cents,
    availableCents: row.available_cents,
  }));
}
