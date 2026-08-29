import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/security/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  applyHbCreditRefundRequestsSchemaSql,
  checkHbCreditRefundRequestsSchema,
} from "@/lib/supabase/hbCreditRefundRequestsSchema";

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
  const before = await checkHbCreditRefundRequestsSchema(supabase);
  if (before.ok) {
    return NextResponse.json({ ok: true, alreadyApplied: true, schema: before });
  }

  const applied = await applyHbCreditRefundRequestsSchemaSql();
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

  const after = await checkHbCreditRefundRequestsSchema(supabase);
  return NextResponse.json({
    ok: after.ok,
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
  const schema = await checkHbCreditRefundRequestsSchema(getSupabaseAdmin()!);
  return NextResponse.json({ ok: schema.ok, schema });
}
