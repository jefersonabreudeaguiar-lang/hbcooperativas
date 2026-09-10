/** Rotas /api públicas (sem JWT) quando a segurança está ativa. */
export function isPublicApiRoute(pathname: string, method: string): boolean {
  const m = method.toUpperCase();

  if (pathname === "/api/cooperativas" && m === "POST") return true;
  if (pathname === "/api/credit/status" && m === "GET") return true;

  /** Webhook Asaas — auth no handler (asaas-access-token). */
  if (pathname === "/api/webhooks/asaas" && m === "POST") return true;

  /** Crons Vercel — auth no handler (Bearer CRON_SECRET). */
  if (pathname.startsWith("/api/cron/") && (m === "GET" || m === "POST")) return true;

  /** Lab sync — dados sintéticos; handler retorna 404 se lab desativado. */
  if (pathname === "/api/lab/sync-audit" && m === "GET") return true;

  /** Lab HOBELISCO HX — snapshot/arena/diálogo; handler retorna 404 se lab desativado. */
  if (pathname === "/api/lab/hobelisco" && (m === "GET" || m === "POST")) return true;
  if (pathname.startsWith("/api/lab/hobelisco/v2") && (m === "GET" || m === "POST")) return true;
  if (pathname === "/api/lab/hobelisco/credit-watch" && m === "POST") return true;
  if (pathname === "/api/lab/hobelisco/adaptive-defense" && m === "POST") return true;
  if (pathname === "/api/lab/hobelisco/whatsapp" && (m === "GET" || m === "POST")) return true;
  if (pathname === "/api/lab/hobelisco/dialogue" && m === "POST") return true;

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
