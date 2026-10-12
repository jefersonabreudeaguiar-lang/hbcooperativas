import { NextResponse, type NextRequest } from "next/server";
import { getAuthSecret, isApiSecurityEnforced } from "@/lib/security/env";
import { extractAccessToken, verifyAccessToken } from "@/lib/security/jwt";
import { hasSetupSecret, isPublicApiRoute } from "@/lib/security/publicApiPaths";
import { evaluateLeva2Defense } from "@/lib/security/crawlerDefenseLeva2";

function leva2Response(request: NextRequest, pathname: string): NextResponse | null {
  const verdict = evaluateLeva2Defense(request, pathname);
  if (verdict.action === "allow") return null;
  const headers = { "Cache-Control": "no-store" };
  if (verdict.action === "block_pages" && !pathname.startsWith("/api/")) {
    return new NextResponse(verdict.message, {
      status: verdict.status,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json({ error: verdict.message }, { status: verdict.status, headers });
}

function httpsRedirectIfNeeded(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  const proto = request.headers.get("x-forwarded-proto");
  if (proto && proto !== "http") return null;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return null;
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const httpsRedirect = httpsRedirectIfNeeded(request);
  if (httpsRedirect) return httpsRedirect;

  const blocked = leva2Response(request, pathname);
  if (blocked) return blocked;

  if (!pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-cache, must-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    const dpl = (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim();
    if (dpl) response.headers.set("x-hb-deployment-id", dpl);
    return response;
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

  const token = extractAccessToken(request);
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
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|pwa-boot\\.html|pwa-launch\\.html|pwa-rescue\\.html|pwa-diag\\.html|pwa-crash-forensics\\.html|pwa-console-forensics\\.html|hb-console-forensics-paste\\.js|sw\\.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|webmanifest)$).*)",
  ],
};
