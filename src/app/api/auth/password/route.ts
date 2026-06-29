import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/security/apiGuard";
import { findAppUserByEmail, updateAppUserPasswordHash, verifyAppUserPassword } from "@/lib/supabase/usersAuth";

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "").trim();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Informe a senha atual e a nova senha." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "A nova senha deve ter no mínimo 6 caracteres." }, { status: 400 });
  }

  if (!auth.enforced || !auth.session?.email) {
    return NextResponse.json({ success: true, localOnly: true });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, localOnly: true });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Nuvem indisponível." }, { status: 503 });
  }

  const email = String(auth.session.email).trim().toLowerCase();
  const valid = await verifyAppUserPassword(supabase, email, currentPassword);
  if (!valid) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
  }

  const row = await findAppUserByEmail(supabase, email);
  if (!row) {
    return NextResponse.json({ error: "Usuário não encontrado na nuvem." }, { status: 404 });
  }

  await updateAppUserPasswordHash(supabase, row.id, newPassword);
  return NextResponse.json({ success: true });
}
