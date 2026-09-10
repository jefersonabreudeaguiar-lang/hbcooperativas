import { NextResponse, after, type NextRequest } from "next/server";
import { getAuthSecret, isApiSecurityEnforced } from "@/lib/security/env";
import { extractAccessToken, verifyAccessToken } from "@/lib/security/jwt";
import { hasSetupSecret, isPublicApiRoute } from "@/lib/security/publicApiPaths";
import { isAutoObserverEnabled, shouldObservePath } from "@/lib/lab/hobeliscoAutoObserver";

import type { HobeliscoIngestPayload } from "@/lib/lab/hobeliscoAutoObserver";

function scheduleObservation(payload: HobeliscoIngestPayload) {
  if (!isAutoObserverEnabled() || !shouldObservePath(payload.endpoint)) return;
  after(async () => {
    try {
      const { ingestHobeliscoObservation } = await import("@/lib/lab/hobeliscoAutoObserver");
      await ingestHobeliscoObservation(payload);
    } catch {
      /* fail-silent */
    }
  });
}

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

  const token = extractAccessToken(request);
  if (!token) {
    scheduleObservation({
      type: "auth",
      endpoint: pathname,
      method: request.method,
      status: 401,
      cooperativeId: null,
      outcome: "failure",
      eventType: "auth_failure",
    });
    return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  }

  const session = await verifyAccessToken(token);
  if (!session) {
    scheduleObservation({
      type: "auth",
      endpoint: pathname,
      method: request.method,
      status: 401,
      cooperativeId: null,
      outcome: "failure",
      eventType: "auth_failure",
    });
    return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-hb-user-id", session.sub);
  headers.set("x-hb-user-role", String(session.role));
  if (session.cooperativaCnpj) {
    headers.set("x-hb-cooperativa-cnpj", String(session.cooperativaCnpj));
  }

  scheduleObservation({
    type: "api",
    endpoint: pathname,
    method: request.method,
    status: 200,
    cooperativeId: session.cooperativaCnpj ?? null,
    outcome: "success",
  });

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
