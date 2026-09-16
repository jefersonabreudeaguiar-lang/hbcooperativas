import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";

export type PaymentRowForUsed = {
  event_type: string;
  status: string;
  amount_cents: number | string | null;
  credit_debited_cents?: number | string | null;
};

/** Valor usado = soma do crédito debitado em PAYMENT ainda posted (estornados ficam reversed). */
export function computeAmountUsedCentsFromPayments(rows: PaymentRowForUsed[]): number {
  let total = 0;
  for (const row of rows) {
    if (String(row.event_type) !== "PAYMENT" || String(row.status) !== "posted") continue;
    const debit =
      row.credit_debited_cents != null && row.credit_debited_cents !== ""
        ? Number(row.credit_debited_cents)
        : Number(row.amount_cents ?? 0);
    if (Number.isFinite(debit) && debit > 0) total += debit;
  }
  return Math.max(0, Math.round(total));
}

const RECONCILE_ACTOR = "system:hb_credit_amount_used_reconcile";

export async function reconcileCooperadoAmountUsedCents(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string = RECONCILE_ACTOR
): Promise<
  | { ok: true; corrected: false; expectedCents: number; storedCents: number }
  | { ok: true; corrected: true; expectedCents: number; previousCents: number }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  if (!cooperadoId) return { ok: false, error: "Cooperado inválido." };

  const { data: account, error: accErr } = await supabase
    .from("hb_credit_accounts")
    .select("id, limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (accErr) return { ok: false, error: accErr.message };
  if (!account) return { ok: false, error: "Conta HB não encontrada." };

  const { data: txs, error: txErr } = await supabase
    .from("hb_credit_transactions")
    .select("event_type, status, amount_cents, credit_debited_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .eq("event_type", "PAYMENT");

  if (txErr) return { ok: false, error: txErr.message };

  const expected = computeAmountUsedCentsFromPayments((txs ?? []) as PaymentRowForUsed[]);
  const stored = Number(account.amount_used_cents ?? 0);
  const limit = Number(account.limit_released_cents ?? 0);

  if (stored === expected) {
    return { ok: true, corrected: false, expectedCents: expected, storedCents: stored };
  }

  const clamped = Math.min(Math.max(0, expected), limit >= 0 ? limit : expected);
  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("hb_credit_accounts")
    .update({
      amount_used_cents: clamped,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq("id", account.id)
    .eq("amount_used_cents", stored);

  if (upErr) return { ok: false, error: upErr.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "AMOUNT_USED_RECONCILED",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: {
      previous_cents: stored,
      expected_cents: expected,
      applied_cents: clamped,
    },
  });

  return { ok: true, corrected: true, expectedCents: clamped, previousCents: stored };
}
