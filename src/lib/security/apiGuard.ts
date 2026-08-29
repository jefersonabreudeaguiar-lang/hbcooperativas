import { NextResponse } from "next/server";
import { normalizeCnpj } from "@/utils/cooperativa";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { extractBearerToken, verifyAccessToken, type SessionClaims } from "@/lib/security/jwt";
import { rateLimitApi } from "@/lib/security/rateLimit";

export type AuthResult =
  | { ok: true; session: SessionClaims | null; enforced: boolean }
  | { ok: false; response: NextResponse };

export async function requireApiAuth(request: Request): Promise<AuthResult> {
  if (!rateLimitApi(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Muitas requisições. Aguarde um momento." }, { status: 429 }),
    };
  }

  if (!isApiSecurityEnforced()) {
    return { ok: true, session: null, enforced: false };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Autenticação necessária." }, { status: 401 }),
    };
  }

  const session = await verifyAccessToken(token);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }),
    };
  }

  return { ok: true, session, enforced: true };
}

export function canAccessCooperativaCnpj(session: SessionClaims, cnpj: string): boolean {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;

  if (session.role === "admin" || session.role === "tesoureiro") return true;

  const sessionCnpj = session.cooperativaCnpj ? normalizeCnpj(session.cooperativaCnpj) : "";
  if (sessionCnpj.length === 14 && sessionCnpj === digits) {
    if (session.role === "cooperado" || session.role === "parceiro" || session.role === "responsavel") {
      return true;
    }
  }

  return false;
}

export function requireCooperativaAccess(
  session: SessionClaims | null,
  cnpj: string,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (!canAccessCooperativaCnpj(session, cnpj)) {
    return NextResponse.json({ error: "Sem permissão para esta cooperativa." }, { status: 403 });
  }
  return null;
}

export function requireStaffRole(
  session: SessionClaims | null,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (session.role === "cooperado" || session.role === "parceiro") {
    return NextResponse.json({ error: "Ação restrita à equipe da cooperativa." }, { status: 403 });
  }
  return null;
}
