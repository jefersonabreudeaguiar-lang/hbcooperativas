import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { signAccessToken } from "@/lib/security/jwt";
import { rateLimitAuth } from "@/lib/security/rateLimit";
import type { AppUserRow } from "@/lib/supabase/usersAuth";
import type { UserRole } from "@/types";

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function tokenResponseForUser(user: AppUserRow): Promise<NextResponse> {
  const token = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    cooperativaId: user.cooperativa_id ?? undefined,
    cooperadoId: user.cooperado_id ?? undefined,
    cooperativaCnpj: user.cooperativa_cnpj ?? undefined,
  });
  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      cooperativaId: user.cooperativa_id,
      cooperadoId: user.cooperado_id,
      cooperativaCnpj: user.cooperativa_cnpj,
    },
  });
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
