import type { SupabaseClient } from "@supabase/supabase-js";

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

  return {
    ok: false,
    error: "Cadastro de mercados parceiros incompleto na nuvem.",
    hint: "Solicite à administração a conferência das migrations atuais pelo processo de lançamento.",
  };
}

/** O fallback completo antigo substitui rotinas financeiras atuais. */
export async function applyHbCreditPartnersSchemaSql(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Reparo legado desativado. Aplique somente as migrations atuais revisadas pelo processo de lançamento." };
}
