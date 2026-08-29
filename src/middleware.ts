import { NextResponse, type NextRequest } from "next/server";
import { getAuthSecret, isApiSecurityEnforced } from "@/lib/security/env";
import { extractBearerToken, verifyAccessToken } from "@/lib/security/jwt";
import { hasSetupSecret, isPublicApiRoute } from "@/lib/security/publicApiPaths";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!isApiSecurityEnforced()) {
    return NextResponse.next();
  }

  if (isPublicApiRoute(pathname, request.method)) {
    return NextResponse.next();
  }

  if (hasSetupSecret(request, getAuthSecret())) {
    return NextResponse.next();
  }

  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  }

  const session = await verifyAccessToken(token);
  if (!session) {
    return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-hb-user-id", session.sub);
  headers.set("x-hb-user-role", String(session.role));
  if (session.cooperativaCnpj) {
    headers.set("x-hb-cooperativa-cnpj", String(session.cooperativaCnpj));
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
