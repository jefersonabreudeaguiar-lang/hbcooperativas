import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { checkAppUsersTable, isAppUsersTableMissing } from "@/lib/supabase/appUsersSchema";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      appUsersTableOk: false,
      message: "Supabase não configurado.",
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      configured: false,
      appUsersTableOk: false,
      message: "Cliente Supabase indisponível.",
    });
  }

  const { error } = await supabase.from("app_users").select("id", { head: true, count: "exact" });
  if (error && isAppUsersTableMissing(error)) {
    return NextResponse.json({
      configured: true,
      appUsersTableOk: false,
      code: "APP_USERS_MISSING",
      message:
        "Tabela app_users ausente no Supabase. Execute supabase/migrations/APPLY_APP_USERS.sql no SQL Editor.",
    });
  }

  if (error) {
    return NextResponse.json({
      configured: true,
      appUsersTableOk: false,
      message: error.message,
    });
  }

  const ok = await checkAppUsersTable(supabase);
  return NextResponse.json({
    configured: true,
    appUsersTableOk: ok,
    message: ok ? "Autenticação na nuvem pronta." : "Tabela app_users indisponível.",
  });
}
