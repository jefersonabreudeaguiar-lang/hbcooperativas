import { NextResponse } from "next/server";
import { extractBearerToken, verifyAccessToken, signAccessToken } from "@/lib/security/jwt";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { rateLimitAuth } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  if (!rateLimitAuth(request)) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  }

  if (!isApiSecurityEnforced()) {
    return NextResponse.json({ valid: true, enforced: false });
  }

  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ valid: false, enforced: true }, { status: 401 });
  }

  const session = await verifyAccessToken(token);
  if (!session?.sub) {
    return NextResponse.json({ valid: false, enforced: true }, { status: 401 });
  }

  const refreshed = await signAccessToken({
    sub: session.sub,
    email: String(session.email),
    name: String(session.name ?? ""),
    role: session.role,
    cooperativaId: session.cooperativaId,
    cooperadoId: session.cooperadoId,
    cooperativaCnpj: session.cooperativaCnpj,
  });

  return NextResponse.json({
    valid: true,
    enforced: true,
    token: refreshed,
    user: {
      id: session.sub,
      email: session.email,
      name: session.name,
      role: session.role,
      cooperativaId: session.cooperativaId,
      cooperadoId: session.cooperadoId,
      cooperativaCnpj: session.cooperativaCnpj,
    },
  });
}
