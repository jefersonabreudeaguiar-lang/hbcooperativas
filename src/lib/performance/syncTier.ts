/**
 * HX 8.0 — tiers de sync (contrato RQL). Hoje todos mapeiam para o mesmo runSync;
 * deltas por domínio entram em ondas futuras (8.4).
 */
export type SyncTier = "pulse" | "notas_delta" | "financeiro_delta" | "operacional_full";

export type SyncTierRequest = {
  tier: SyncTier;
  /** Igual requestAppSync / requestAppSyncLight quando false/true. */
  force: boolean;
  immediate?: boolean;
};

/** Tier mais “forte” vence ao coalescer pedidos no mesmo debounce. */
const TIER_RANK: Record<SyncTier, number> = {
  pulse: 0,
  notas_delta: 1,
  financeiro_delta: 2,
  operacional_full: 3,
};

export function mergeSyncTierRequests(
  current: SyncTierRequest | null,
  incoming: SyncTierRequest
): SyncTierRequest {
  if (!current) return incoming;
  const tier =
    TIER_RANK[incoming.tier] >= TIER_RANK[current.tier] ? incoming.tier : current.tier;
  return {
    tier,
    force: current.force || incoming.force,
    immediate: current.immediate || incoming.immediate,
  };
}

/** Defaults de force por tier (infra 8.0 — comportamento legado preservado nos wrappers). */
export function defaultForceForSyncTier(tier: SyncTier): boolean {
  return tier === "operacional_full";
}
