/** Rotas /api públicas (sem JWT) quando a segurança está ativa. */
export function isPublicApiRoute(pathname: string, method: string): boolean {
  const m = method.toUpperCase();

  if (pathname === "/api/cooperativas" && m === "POST") return true;
  if (pathname === "/api/credit/status" && m === "GET") return true;

  const publicPaths = new Set([
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/register-parceiro",
    "/api/auth/provision",
    "/api/auth/sync-session",
    "/api/auth/schema-status",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/cooperativas/lookup",
    "/api/cooperativas/status",
    "/api/cooperativas/verify-cadastro-senha",
  ]);

  if (publicPaths.has(pathname)) return true;

  /** Renova cookie httpOnly — não pode exigir JWT válido no middleware (token expirado). */
  if (pathname === "/api/auth/session" && m === "GET") return true;

  if (pathname.startsWith("/api/admin/apply-") && m === "POST") return false;

  return false;
}

export function hasSetupSecret(request: Request, secret: string): boolean {
  const header = request.headers.get("x-setup-secret")?.trim();
  return Boolean(header && secret && header === secret);
}
