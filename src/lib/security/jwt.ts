import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@/types";
import { getAuthSecret } from "@/lib/security/env";

export interface SessionClaims extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  cooperativaId?: string;
  cooperadoId?: string;
  cooperativaCnpj?: string;
}

export type SessionTokenInput = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  cooperativaId?: string;
  cooperadoId?: string;
  cooperativaCnpj?: string;
};

const ISSUER = "hb-cooperativas";
const AUDIENCE = "hb-cooperativas-api";
const TTL = "7d";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret());
}

export async function signAccessToken(claims: SessionTokenInput): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub || !payload.email || !payload.role) return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}
