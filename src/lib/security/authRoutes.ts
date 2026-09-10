import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { signAccessToken } from "@/lib/security/jwt";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { buildSessionCookieHeader } from "@/lib/security/sessionCookie";
import { rateLimitAuth } from "@/lib/security/rateLimit";
import type { AppUserRow } from "@/lib/supabase/usersAuth";
import { appUserRowToAuthUser, appUserRowToSessionTokenInput } from "@/lib/supabase/usersAuth";
import type { UserRole } from "@/types";

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function resolveEffectiveAppUserRole(
  user: Pick<AppUserRow, "role" | "cooperado_id">
): UserRole {
  const role = user.role as UserRole;
  if (role === "parceiro" || role === "contador") return role;
  if (user.cooperado_id?.trim()) return "cooperado";
  return role;
}

export async function tokenResponseForUser(user: AppUserRow): Promise<NextResponse> {
  const role = resolveEffectiveAppUserRole(user);
  const token = await signAccessToken({
    ...appUserRowToSessionTokenInput(user),
    role,
    mfaVerified: true,
  });
  const enforced = isApiSecurityEnforced();
  const authUser = appUserRowToAuthUser(user);
  const response = NextResponse.json({
    ...(enforced ? {} : { token }),
    user: {
      ...authUser,
      role,
    },
  });
  response.headers.append("Set-Cookie", buildSessionCookieHeader(token));
  return response;
}

export function authUnavailable(): NextResponse {
  return NextResponse.json({ error: "Autenticação na nuvem indisponível.", configured: false }, { status: 503 });
}

export function authRateLimited(): NextResponse {
  return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
}

export function ensureAuthInfrastructure(request: Request): NextResponse | null {
  if (!rateLimitAuth(request)) return authRateLimited();
  if (!isSupabaseConfigured()) return authUnavailable();
  if (!getSupabaseAdmin()) return authUnavailable();
  return null;
}
