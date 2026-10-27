function parseV2Flag(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** V2 produto: cooperado + responsável só HB Créditos (build-time no cliente). */
export function isV2HbOnlyClient(): boolean {
  return parseV2Flag(process.env.NEXT_PUBLIC_V2_HB_ONLY);
}

/** Home pós-login / guest redirect — não altera parceiro, contador, admin. */
export function resolveAppHomePath(role: string, fallback = "/dashboard"): string {
  if (!isV2HbOnlyClient()) return fallback;
  const r = String(role).trim().toLowerCase();
  if (r === "cooperado") return "/minha-conta-coop";
  if (r === "parceiro") return "/mercado-parceiro";
  if (r === "responsavel" || r === "tesoureiro") return "/conta-coop";
  return fallback;
}
