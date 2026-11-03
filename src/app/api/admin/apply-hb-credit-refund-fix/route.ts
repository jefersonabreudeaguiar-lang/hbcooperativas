import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/security/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkHbCreditRefundFixSchema,
} from "@/lib/supabase/hbCreditRefundFixSchema";

function isAuthorized(request: Request): boolean {
  const secret = getAuthSecret();
  const header = request.headers.get("x-setup-secret")?.trim();
  return Boolean(header && header === secret);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  return NextResponse.json({ error: "Reparo legado desativado. Utilize o processo de migrations revisadas do lançamento." }, { status: 410 });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const schema = await checkHbCreditRefundFixSchema(getSupabaseAdmin()!);
  return NextResponse.json({ ok: schema.ok, schema });
}
