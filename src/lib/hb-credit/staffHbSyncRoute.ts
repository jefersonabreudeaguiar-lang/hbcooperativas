const STAFF_HB_COOP_WIDE_PREFIXES = ["/conta-coop", "/relatorios"] as const;

/** Sync cooperativa-wide (todos os cooperados) — só onde o staff realmente usa HB. */
export function isStaffHbCoopWideSyncRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!p) return false;
  return STAFF_HB_COOP_WIDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
