import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/security/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { applyAppUsersSchemaSql, checkAppUsersTable } from "@/lib/supabase/appUsersSchema";

function isAuthorized(request: Request): boolean {
  const secret = getAuthSecret();
  const header = request.headers.get("x-setup-secret")?.trim();
  return Boolean(header && header === secret);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  if (await checkAppUsersTable(supabase)) {
    return NextResponse.json({ ok: true, alreadyApplied: true });
  }

  const applied = await applyAppUsersSchemaSql();
  if (!applied.ok) {
    return NextResponse.json(
      {
        error: applied.error,
        hint: "Configure DATABASE_URL ou SUPABASE_DB_PASSWORD na Vercel, ou execute APPLY_APP_USERS.sql no SQL Editor.",
      },
      { status: 503 }
    );
  }

  const ok = await checkAppUsersTable(supabase);
  return NextResponse.json({ ok, alreadyApplied: false });
}
