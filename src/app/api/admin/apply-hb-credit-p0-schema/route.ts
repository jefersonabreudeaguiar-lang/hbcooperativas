import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/security/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { applyHbCreditP0SchemaSql, checkHbCreditP0Schema } from "@/lib/supabase/hbCreditP0Schema";

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
  const before = await checkHbCreditP0Schema(supabase);
  if (before.capPercentOk && before.pinSecurityOk) {
    return NextResponse.json({ ok: true, alreadyApplied: true, schema: before });
  }

  const applied = await applyHbCreditP0SchemaSql();
  if (!applied.ok) {
    return NextResponse.json(
      {
        error: applied.error,
        hint: "Configure DATABASE_URL na Vercel ou execute o SQL no Supabase SQL Editor.",
        schemaBefore: before,
      },
      { status: 503 }
    );
  }

  const after = await checkHbCreditP0Schema(supabase);
  return NextResponse.json({
    ok: after.capPercentOk && after.pinSecurityOk,
    alreadyApplied: false,
    applied: applied.applied,
    schema: after,
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const schema = await checkHbCreditP0Schema(getSupabaseAdmin()!);
  return NextResponse.json({ ok: schema.capPercentOk && schema.pinSecurityOk, schema });
}
