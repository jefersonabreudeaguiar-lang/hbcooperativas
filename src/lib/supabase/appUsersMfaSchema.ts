import type { SupabaseClient } from "@supabase/supabase-js";

export async function isAppUsersMfaReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("app_users").select("totp_enabled_at").limit(1);
  if (!error) return true;
  return !/totp_enabled_at|column/i.test(error.message ?? "");
}

export function userHasTotpEnabled(user: {
  totp_enabled_at?: string | null;
}): boolean {
  return Boolean(user.totp_enabled_at);
}
