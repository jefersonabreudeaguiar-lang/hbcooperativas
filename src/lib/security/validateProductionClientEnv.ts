/**
 * Valida variáveis públicas que o bundle cliente usa (PWA / mixed content).
 * Chamado no build (next.config) e opcionalmente em runtime server.
 */
export function validateProductionClientEnv(): string[] {
  const issues: string[] = [];
  if (process.env.VERCEL_ENV !== "production" && process.env.NODE_ENV !== "production") {
    return issues;
  }

  const checkHttps = (name: string, value: string | undefined) => {
    const v = (value ?? "").trim();
    if (!v) return;
    if (!v.startsWith("http://")) return;
    if (/localhost|127\.0\.0\.1/i.test(v)) return;
    issues.push(`${name} usa http:// em produção (${v}) — use https://`);
  };

  checkHttps("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  checkHttps("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL);

  return issues;
}
