/** Valor público para `next.config` env (inline no bundle). Produção oficial = V2 ligado por padrão. */
export function resolveV2HbOnlyPublicEnv(raw?: string): "0" | "1" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return "0";
  if (v === "1" || v === "true" || v === "yes") return "1";
  if (process.env.VERCEL_ENV === "production") return "1";
  return "0";
}

/** V2 produto: cooperado + responsável só HB Créditos (cliente + API em produção). */
export function isV2HbOnlyClient(): boolean {
  return resolveV2HbOnlyPublicEnv(process.env.NEXT_PUBLIC_V2_HB_ONLY) === "1";
}

/** Home pós-login / guest redirect — não altera parceiro, contador, admin. */
export function resolveAppHomePath(role: string, fallback = "/dashboard"): string {
  if (!isV2HbOnlyClient()) return fallback;
  const r = String(role).trim().toLowerCase();
  if (r === "cooperado") return "/dashboard";
  if (r === "parceiro") return "/mercado-parceiro";
  if (r === "responsavel" || r === "tesoureiro") return "/conta-coop";
  return fallback;
}
