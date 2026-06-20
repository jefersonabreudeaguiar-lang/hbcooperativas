import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isCooperativasTableMissing } from "@/lib/supabase/errors";

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({
      status: "not_configured",
      message: "Configure NEXT_PUBLIC_SUPABASE_URL (Vercel → Settings → Environment Variables).",
    });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "not_configured",
      message:
        "Falta SUPABASE_SERVICE_ROLE_KEY. Cadastro de responsável exige a chave secreta do Supabase (não a publishable).",
    });
  }

  const client = getSupabaseAdmin();
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
