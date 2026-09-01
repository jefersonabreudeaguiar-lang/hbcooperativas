import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/security/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  applyHbCreditPartnersSchemaSql,
  checkHbCreditPartnersSchema,
} from "@/lib/supabase/hbCreditPartnersSchema";

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
  const before = await checkHbCreditPartnersSchema(supabase);
  if (before.partnersTableOk && before.appUserIdColumnOk && before.appUsersParceiroIdOk) {
    return NextResponse.json({ ok: true, alreadyApplied: true, schema: before });
  }

  const applied = await applyHbCreditPartnersSchemaSql();
  if (!applied.ok) {
    return NextResponse.json(
      {
        error: applied.error,
        hint: "Configure DATABASE_URL na Vercel ou execute APPLY_HB_CREDIT_PARTNERS.sql no SQL Editor.",
        schemaBefore: before,
      },
      { status: 503 }
    );
  }

  const after = await checkHbCreditPartnersSchema(supabase);
  return NextResponse.json({
    ok: after.partnersTableOk && after.appUserIdColumnOk && after.appUsersParceiroIdOk,
    alreadyApplied: false,
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
  const schema = await checkHbCreditPartnersSchema(getSupabaseAdmin()!);
  return NextResponse.json({
    ok: schema.partnersTableOk && schema.appUserIdColumnOk && schema.appUsersParceiroIdOk,
    schema,
  });
}
