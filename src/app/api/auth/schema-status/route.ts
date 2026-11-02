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

  let error: { code?: string; message?: string } | null;
  try {
    ({ error } = await supabase.from("app_users").select("id").limit(1));
  } catch {
    return NextResponse.json({
      configured: true,
      appUsersTableOk: false,
      code: "APP_USERS_UNAVAILABLE",
      message: "Não foi possível confirmar a conexão de autenticação. Tente novamente.",
    }, { status: 503 });
  }
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
    return NextResponse.json({
      configured: true,
      appUsersTableOk: false,
      code: "APP_USERS_UNAVAILABLE",
      message: "Não foi possível confirmar a conexão de autenticação. Tente novamente.",
    }, { status: 503 });
  }

  return NextResponse.json({
    configured: true,
    appUsersTableOk: true,
    message: "Autenticação na nuvem pronta.",
  });
}
