/** Rotas onde warmup HB faz sentido — fora daqui (ex.: Notas/Conferir) evita lote cooperativa-wide. */
const STAFF_HB_COOP_WIDE_PREFIXES = [
  "/conta-coop",
  "/relatorios",
  "/ficha-corrida",
] as const;

/** Rotas HB staff — navegação / contexto amplo (warmup, etc.). */
export function isStaffHbCoopWideSyncRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!p) return false;
  return STAFF_HB_COOP_WIDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

const STAFF_HB_COOP_BACKGROUND_SYNC_PREFIXES = [
  "/conta-coop",
  "/relatorios",
  "/ficha-corrida",
] as const;

/**
 * Sync cooperativa-wide em background (ficha-descontos / sync-limite em lote).
 * Não inclui `/notas-pedido` nem `/cooperados` — evita travar Conferir com refresh HB em massa.
 */
export function isStaffHbCoopBackgroundSyncRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!p) return false;
  return STAFF_HB_COOP_BACKGROUND_SYNC_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`)
  );
}

/** Poll cooperativa-wide de descontos HB — só onde o relatório/ficha depende (evita lote em Cooperados/Dashboard). */
const STAFF_HB_COOP_PERIODIC_DESCONTOS_PREFIXES = [
  "/relatorios",
  "/ficha-corrida",
] as const;

export function isStaffHbCoopPeriodicDescontosSyncRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!p) return false;
  return STAFF_HB_COOP_PERIODIC_DESCONTOS_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`)
  );
}
