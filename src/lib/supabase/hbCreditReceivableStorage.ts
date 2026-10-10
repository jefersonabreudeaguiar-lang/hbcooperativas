import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

type ReceivableRow = { id: string; status: string };

/** Garante recebível do mercado para venda postada (repara dados antigos / falha na RPC). */
export async function ensurePartnerReceivableForTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  options?: { promoteEligible?: boolean }
): Promise<ReceivableRow | null> {
  const promoteEligible = options?.promoteEligible ?? false;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("hb_credit_receivables")
    .select("id, status")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (existing) {
    const status = String(existing.status);
    if (
      promoteEligible &&
      (status === "OPEN" || status === "BLOCKED_FOR_REVIEW")
    ) {
      await supabase
        .from("hb_credit_receivables")
        .update({ status: "ELIGIBLE", updated_at: now })
        .eq("id", String(existing.id));
      return { id: String(existing.id), status: "ELIGIBLE" };
    }
    return { id: String(existing.id), status };
  }

  const { data: tx } = await supabase
    .from("hb_credit_transactions")
    .select(
      "id, cooperative_cnpj, partner_id, amount_cents, discount_cents, net_receivable_cents, gross_amount_cents, status, event_type"
    )
    .eq("id", transactionId)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted")
    .maybeSingle();

  if (!tx) return null;

  const gross = Number(tx.gross_amount_cents ?? tx.amount_cents);
  const discount = Number(tx.discount_cents ?? 0);
  const net = Number(tx.net_receivable_cents ?? tx.amount_cents ?? gross - discount);
  const amountCents = net > 0 ? net : gross;
  if (amountCents <= 0) return null;

  const status = promoteEligible ? "ELIGIBLE" : "OPEN";
  const id = genId("recv");
  const { data: inserted, error } = await supabase
    .from("hb_credit_receivables")
    .insert({
      id,
      cooperative_cnpj: normalizeCnpj(String(tx.cooperative_cnpj)),
      partner_id: String(tx.partner_id),
      transaction_id: transactionId,
      amount_cents: amountCents,
      status,
      gross_amount_cents: gross,
      discount_cents: discount,
      net_amount_cents: amountCents,
      created_at: now,
      updated_at: now,
    })
    .select("id, status")
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: retry } = await supabase
        .from("hb_credit_receivables")
        .select("id, status")
        .eq("transaction_id", transactionId)
        .maybeSingle();
      if (!retry) return null;
      if (
        promoteEligible &&
        (String(retry.status) === "OPEN" || String(retry.status) === "BLOCKED_FOR_REVIEW")
      ) {
        await supabase
          .from("hb_credit_receivables")
          .update({ status: "ELIGIBLE", updated_at: now })
          .eq("id", String(retry.id));
        return { id: String(retry.id), status: "ELIGIBLE" };
      }
      return { id: String(retry.id), status: String(retry.status) };
    }
    return null;
  }

  return inserted
    ? { id: String(inserted.id), status: String(inserted.status) }
    : null;
}
