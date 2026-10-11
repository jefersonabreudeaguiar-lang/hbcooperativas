import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isAppUsersTableMissing } from "@/lib/supabase/appUsersSchema";

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

  const { error } = await supabase.from("app_users").select("id").limit(1);
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
    console.error("[schema-status] app_users probe:", error.message);
    if (isAppUsersTableMissing(error)) {
      return NextResponse.json({
        configured: true,
        appUsersTableOk: false,
        message: error.message,
        code: "APP_USERS_MISSING",
      });
    }
    return NextResponse.json({
      configured: true,
      appUsersTableOk: true,
      message: "Autenticação na nuvem pronta.",
      probeWarning: error.message,
    });
  }

  return NextResponse.json({
    configured: true,
    appUsersTableOk: true,
    message: "Autenticação na nuvem pronta.",
  });
}
