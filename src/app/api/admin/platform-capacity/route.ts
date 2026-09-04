import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { buildPlatformCapacitySnapshot } from "@/services/platformCapacityService";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const snapshot = await buildPlatformCapacitySnapshot(supabase);
  return NextResponse.json({ ok: true, snapshot });
}
