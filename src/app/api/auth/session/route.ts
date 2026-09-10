import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { extractAccessToken, verifyAccessToken, signAccessToken } from "@/lib/security/jwt";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { buildSessionCookieHeader } from "@/lib/security/sessionCookie";
import { rateLimitAuth } from "@/lib/security/rateLimit";
import { resolveEffectiveAppUserRole } from "@/lib/security/authRoutes";
import { findAppUserById, appUserRowToAuthUser, appUserRowToSessionTokenInput } from "@/lib/supabase/usersAuth";
import type { UserRole } from "@/types";

export async function GET(request: Request) {
  if (!rateLimitAuth(request)) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  }

  if (!isApiSecurityEnforced()) {
    return NextResponse.json({ valid: true, enforced: false });
  }

  const token = extractAccessToken(request);
  if (!token) {
    return NextResponse.json({ valid: false, enforced: true }, { status: 401 });
  }

  const session = await verifyAccessToken(token);
  if (!session?.sub) {
    return NextResponse.json({ valid: false, enforced: true }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const dbUser = supabase ? await findAppUserById(supabase, session.sub) : null;
  const source = dbUser ?? {
    id: session.sub,
    email: String(session.email),
    name: String(session.name ?? ""),
    role: session.role as UserRole,
    cooperativa_id: session.cooperativaId ?? null,
    cooperado_id: session.cooperadoId ?? null,
    cooperativa_cnpj: session.cooperativaCnpj ?? null,
    active: true,
    responsavel_principal: session.responsavelPrincipal ?? false,
    modo_acesso: session.modoAcesso ?? "total",
    permissoes_extras: session.permissoesExtras ?? null,
    permissoes_negadas: session.permissoesNegadas ?? null,
    funcao: session.funcao ?? null,
    password_hash: "",
  };

  const effectiveRole = resolveEffectiveAppUserRole(source);
  const refreshed = await signAccessToken({
    ...appUserRowToSessionTokenInput(source),
    role: effectiveRole,
    mfaVerified: true,
  });

  const enforced = isApiSecurityEnforced();
  const response = NextResponse.json({
    valid: true,
    enforced: true,
    ...(enforced ? {} : { token: refreshed }),
    user: {
      ...appUserRowToAuthUser(source),
      role: effectiveRole,
    },
  });
  response.headers.append("Set-Cookie", buildSessionCookieHeader(refreshed));
  return response;
}
