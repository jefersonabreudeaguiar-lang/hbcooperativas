import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authRateLimited,
  authUnavailable,
  clientIp,
  ensureAuthInfrastructure,
} from "@/lib/security/authRoutes";
import { rateLimitPasswordReset } from "@/lib/security/rateLimit";
import {
  consumePasswordResetToken,
  validatePasswordResetToken,
} from "@/lib/supabase/passwordResetTokens";
import { isPasswordResetTableReady } from "@/lib/supabase/passwordResetSchema";
import { isAppUsersTableReady, logSecurityEvent, updateAppUserPasswordHash } from "@/lib/supabase/usersAuth";

export async function GET(request: Request) {
  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  if (!rateLimitPasswordReset(request)) return authRateLimited();

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  if (!(await isAppUsersTableReady(supabase)) || !(await isPasswordResetTableReady(supabase))) {
    return authUnavailable();
  }

  const valid = await validatePasswordResetToken(supabase, token);
  return NextResponse.json({ valid: Boolean(valid) });
}

export async function POST(request: Request) {
  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  if (!rateLimitPasswordReset(request)) return authRateLimited();

  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  const newPassword = String(body?.newPassword ?? "").trim();

  if (!token) {
    return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "A nova senha deve ter no mínimo 6 caracteres." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  if (!(await isAppUsersTableReady(supabase)) || !(await isPasswordResetTableReady(supabase))) {
    return authUnavailable();
  }

  const consumed = await consumePasswordResetToken(supabase, token);
  if (!consumed) {
    return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 400 });
  }

  await updateAppUserPasswordHash(supabase, consumed.userId, newPassword);

  const { data: userRow } = await supabase
    .from("app_users")
    .select("email, cooperativa_cnpj")
    .eq("id", consumed.userId)
    .maybeSingle();

  await logSecurityEvent(supabase, {
    action: "auth.forgot_password.complete",
    userId: consumed.userId,
    userEmail: userRow?.email ?? undefined,
    cooperativaCnpj: userRow?.cooperativa_cnpj ?? undefined,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, message: "Senha redefinida com sucesso." });
}
