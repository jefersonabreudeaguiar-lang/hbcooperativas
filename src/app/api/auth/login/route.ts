import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authRateLimited,
  authUnavailable,
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import { logSecurityEvent, verifyAppUserPassword, isAppUsersTableReady } from "@/lib/supabase/usersAuth";

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
  if (!(await isAppUsersTableReady(supabase))) {
    return NextResponse.json(
      {
        error: "Tabela app_users não existe no Supabase. Execute a migration APPLY_APP_USERS.sql.",
        code: "APP_USERS_MISSING",
      },
      { status: 503 }
    );
  }

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
