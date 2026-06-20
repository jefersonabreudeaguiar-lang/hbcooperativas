import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { getSupabasePublic, isSupabasePublicConfigured } from "@/lib/supabase/public";
import { isCooperativasTableMissing } from "@/lib/supabase/errors";

export async function GET() {
  if (!isSupabaseConfigured() && !isSupabasePublicConfigured()) {
    return NextResponse.json({ status: "not_configured" });
  }

  const client = getSupabaseAdmin() ?? getSupabasePublic();
  if (!client) {
    return NextResponse.json({ status: "error", message: "Cliente Supabase indisponível." });
  }

  const { error } = await client.from("cooperativas").select("id").limit(1);

  if (isCooperativasTableMissing(error)) {
    return NextResponse.json({
      status: "migration_pending",
      message: "Execute o SQL em supabase/migrations/20260320120000_cooperativas.sql no Supabase.",
    });
  }

  if (error) {
    return NextResponse.json({ status: "error", message: error.message });
  }

  return NextResponse.json({ status: "ok" });
}
