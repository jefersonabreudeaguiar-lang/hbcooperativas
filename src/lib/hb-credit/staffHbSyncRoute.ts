const STAFF_HB_COOP_WIDE_PREFIXES = ["/conta-coop", "/relatorios"] as const;

/** Rotas HB staff — navegação / contexto amplo (warmup, etc.). */
export function isStaffHbCoopWideSyncRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!p) return false;
  return STAFF_HB_COOP_WIDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

const STAFF_HB_COOP_BACKGROUND_SYNC_PREFIXES = ["/relatorios"] as const;

/**
 * Sync cooperativa-wide em background (ficha-descontos / sync-limite em lote).
 * Exclui `/conta-coop` — a tela já usa GET limites/dashboard e troca de abas não deve competir com N× ficha-descontos.
 */
export function isStaffHbCoopBackgroundSyncRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!p) return false;
  return STAFF_HB_COOP_BACKGROUND_SYNC_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`)
  );
}
