import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authRateLimited,
  authUnavailable,
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import { logSecurityEvent, verifyAppUserPassword } from "@/lib/supabase/usersAuth";

export async function POST(request: Request) {
  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  const user = await verifyAppUserPassword(supabase, email, password);

  if (!user) {
    return NextResponse.json({ error: "Credenciais inválidas.", code: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  await logSecurityEvent(supabase, {
    action: "auth.login",
    userId: user.id,
    userEmail: user.email,
    cooperativaCnpj: user.cooperativa_cnpj ?? undefined,
    ip: clientIp(request),
  });

  return tokenResponseForUser(user);
}
