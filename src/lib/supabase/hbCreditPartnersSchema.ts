import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runPgSql } from "@/lib/supabase/pgSqlRunner";

export function isHbCreditPartnersTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const msg = error.message ?? "";
  return /hb_credit_partners/i.test(msg) && /(could not find|does not exist|schema cache)/i.test(msg);
}

export function isHbCreditPartnersColumnMissing(error: { message?: string } | null, column: string): boolean {
  if (!error?.message) return false;
  return new RegExp(column, "i").test(error.message) && /(could not find|does not exist|schema cache)/i.test(error.message);
}

export async function checkHbCreditPartnersSchema(supabase: SupabaseClient): Promise<{
  partnersTableOk: boolean;
  appUserIdColumnOk: boolean;
  appUsersParceiroIdOk: boolean;
}> {
  const partners = await supabase.from("hb_credit_partners").select("id").limit(1);
  const partnersTableOk = !partners.error;

  const appUserCol = partnersTableOk
    ? await supabase.from("hb_credit_partners").select("app_user_id").limit(1)
    : { error: partners.error };
  const appUserIdColumnOk = partnersTableOk && !appUserCol.error;

  const parceiroCol = await supabase.from("app_users").select("parceiro_id").limit(1);
  const appUsersParceiroIdOk = !parceiroCol.error;

  return { partnersTableOk, appUserIdColumnOk, appUsersParceiroIdOk };
}

export async function ensureHbCreditPartnersSchema(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string; hint?: string }> {
  const before = await checkHbCreditPartnersSchema(supabase);
  if (before.partnersTableOk && before.appUserIdColumnOk && before.appUsersParceiroIdOk) {
    return { ok: true };
  }

  const applied = await applyHbCreditPartnersSchemaSql();
  if (!applied.ok) {
    return {
      ok: false,
      error: "Tabela de mercados parceiros (Conta Coop) não configurada na nuvem.",
      hint:
        "No Supabase SQL Editor, execute supabase/migrations/APPLY_HB_CREDIT_COMPLETO.sql (ou peça ao admin para rodar POST /api/admin/apply-hb-credit-partners-schema com x-setup-secret).",
    };
  }

  const after = await checkHbCreditPartnersSchema(supabase);
  if (after.partnersTableOk && after.appUserIdColumnOk && after.appUsersParceiroIdOk) {
    return { ok: true };
  }

  return {
    ok: false,
    error: "Schema de mercados parceiros ainda incompleto após tentativa de reparo.",
    hint: "Execute APPLY_HB_CREDIT_COMPLETO.sql manualmente no Supabase.",
  };
}

export async function applyHbCreditPartnersSchemaSql(): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/APPLY_HB_CREDIT_PARTNERS.sql"),
    "utf8"
  );
  return runPgSql(sql);
}
