/**
 * Fase 2.3 — estado server-side de sincronização limite HB × base financeira authoritative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";

export type HbFinancialLimitSyncState = "SYNCED" | "STALE" | "SYNC_PENDING" | "SYNC_FAILED";

export const HB_CREDIT_STATE_STALE_CODE = "HB_CREDIT_STATE_STALE";

export const HB_CREDIT_STATE_STALE_MESSAGE =
  "O crédito está sendo atualizado. Aguarde alguns instantes e tente novamente.";

export async function markHbCreditLimitStale(
  supabase: SupabaseClient,
  opts: {
    cnpj: string;
    cooperadoId: string;
    actorUserId: string;
    reason?: string;
  }
): Promise<{ ok: true; updated: boolean } | { ok: false; error: string }> {
  const digits = normalizeCnpj(opts.cnpj);
  const cooperadoId = String(opts.cooperadoId ?? "").trim();
  if (digits.length !== 14 || !cooperadoId) {
    return { ok: false, error: "CNPJ ou cooperado inválido." };
  }

  const { data, error } = await supabase.rpc("hb_credit_mark_financial_limit_stale", {
    p_cooperative_cnpj: digits,
    p_cooperado_id: cooperadoId,
    p_actor_user_id: opts.actorUserId,
    p_reason: opts.reason ?? "cooperado_payment_confirmed",
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration HB limit sync state não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; updated?: boolean } | null;
  if (!result?.ok) {
    return { ok: false, error: "Falha ao marcar limite HB como desatualizado." };
  }
  return { ok: true, updated: Boolean(result.updated) };
}

export async function markHbCreditLimitSynced(
  supabase: SupabaseClient,
  opts: {
    cnpj: string;
    cooperadoId: string;
    actorUserId: string;
  }
): Promise<{ ok: true; updated: boolean } | { ok: false; error: string }> {
  const digits = normalizeCnpj(opts.cnpj);
  const cooperadoId = String(opts.cooperadoId ?? "").trim();
  if (digits.length !== 14 || !cooperadoId) {
    return { ok: false, error: "CNPJ ou cooperado inválido." };
  }

  const { data, error } = await supabase.rpc("hb_credit_mark_financial_limit_synced", {
    p_cooperative_cnpj: digits,
    p_cooperado_id: cooperadoId,
    p_actor_user_id: opts.actorUserId,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration HB limit sync state não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; updated?: boolean } | null;
  if (!result?.ok) {
    return { ok: false, error: "Falha ao marcar limite HB como sincronizado." };
  }
  return { ok: true, updated: Boolean(result.updated) };
}

export function mapAuthorizeRpcError(result: {
  ok?: boolean;
  error?: string;
  error_code?: string;
}): { error: string; code?: string } {
  if (result?.error_code === HB_CREDIT_STATE_STALE_CODE) {
    return { error: HB_CREDIT_STATE_STALE_MESSAGE, code: HB_CREDIT_STATE_STALE_CODE };
  }
  return { error: result?.error ?? "Pagamento recusado." };
}
