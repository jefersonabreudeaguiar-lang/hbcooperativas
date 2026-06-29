import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isCooperativasTableMissing } from "@/lib/supabase/errors";
import type { CloudPlatformOverview } from "@/services/platformAdminService";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      cooperativasTableOk: false,
      appUsersTableOk: false,
      cooperativas: [],
    } satisfies CloudPlatformOverview);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      configured: false,
      cooperativasTableOk: false,
      appUsersTableOk: false,
      cooperativas: [],
      error: "Cliente Supabase indisponível.",
    } satisfies CloudPlatformOverview);
  }

  const { data, error } = await supabase
    .from("cooperativas")
    .select("id, nome, cnpj, email, responsavel, telefone, status, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({
      configured: true,
      cooperativasTableOk: !isCooperativasTableMissing(error),
      appUsersTableOk: false,
      cooperativas: [],
      error: error.message,
    } satisfies CloudPlatformOverview);
  }

  const { error: usersError } = await supabase.from("app_users").select("id").limit(1);

  return NextResponse.json({
    configured: true,
    cooperativasTableOk: true,
    appUsersTableOk: !usersError,
    cooperativas: (data ?? []).map((row) => ({
      id: String(row.id),
      nome: String(row.nome ?? ""),
      cnpj: String(row.cnpj ?? ""),
      email: String(row.email ?? ""),
      responsavel: String(row.responsavel ?? ""),
      telefone: String(row.telefone ?? ""),
      status: String(row.status ?? "ativa"),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    })),
  } satisfies CloudPlatformOverview);
}
