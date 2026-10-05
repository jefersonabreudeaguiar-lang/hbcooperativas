/**
 * HX 8.4 — plano de pull por tier (gestão; cooperado mantém runSync dedicado).
 */
import type { SyncTier } from "@/lib/performance/syncTier";

export type SyncTierPlan84 = {
  tier: SyncTier;
  bidirectionalFull: boolean;
  pullProfile: boolean;
  pullCooperados: boolean;
  pullNotas: boolean;
  pullOperacional: boolean;
  pullContratos: boolean;
};

const STAFF_PLAN: Record<SyncTier, SyncTierPlan84> = {
  pulse: {
    tier: "pulse",
    bidirectionalFull: false,
    pullProfile: true,
    pullCooperados: true,
    pullNotas: false,
    pullOperacional: false,
    pullContratos: false,
  },
  notas_delta: {
    tier: "notas_delta",
    bidirectionalFull: false,
    pullProfile: true,
    pullCooperados: true,
    pullNotas: true,
    pullOperacional: false,
    pullContratos: false,
  },
  financeiro_delta: {
    tier: "financeiro_delta",
    bidirectionalFull: false,
    pullProfile: true,
    pullCooperados: true,
    pullNotas: false,
    pullOperacional: true,
    pullContratos: false,
  },
  operacional_full: {
    tier: "operacional_full",
    bidirectionalFull: true,
    pullProfile: true,
    pullCooperados: true,
    pullNotas: true,
    pullOperacional: true,
    pullContratos: true,
  },
};

/** Cooperado: tiers não rebaixam segurança — sempre plano completo equivalente. */
const COOPERADO_PLAN: SyncTierPlan84 = STAFF_PLAN.operacional_full;

export function resolveSyncTierPlan84(
  tier: SyncTier,
  audience: "staff" | "cooperado"
): SyncTierPlan84 {
  if (audience === "cooperado") {
    return { ...COOPERADO_PLAN, tier };
  }
  return STAFF_PLAN[tier] ?? STAFF_PLAN.operacional_full;
}
