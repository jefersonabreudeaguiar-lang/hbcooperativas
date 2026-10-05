import type { SyncTier, SyncTierRequest } from "@/lib/performance/syncTier";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";
import { isConferenciaAprovacaoSyncQueueActive } from "@/services/conferenciaAprovacaoSyncQueue";
import { isConferenciaOperacionalPushScopeActive } from "@/services/conferenciaOperacionalPushScope";
import { getSession } from "@/services/dataStore";
import type { UserRole } from "@/types";

const TIER_RANK: Record<SyncTier, number> = {
  pulse: 0,
  notas_delta: 1,
  financeiro_delta: 2,
  operacional_full: 3,
};

const CONFERENCIA_CAP_TIER: SyncTier = "notas_delta";

let conferenciaModalOpen = false;
let conferenciaLancamentoDepth = 0;

export function setStaffConferenciaModalOpen(open: boolean): void {
  conferenciaModalOpen = open;
  if (!open) conferenciaLancamentoDepth = 0;
}

export function setStaffConferenciaLancamentoAtivo(active: boolean): void {
  if (active) conferenciaLancamentoDepth += 1;
  else conferenciaLancamentoDepth = Math.max(0, conferenciaLancamentoDepth - 1);
}

export function isStaffConferenciaModalOpen(): boolean {
  return conferenciaModalOpen;
}

export function isStaffConferenciaSyncTierCapActive(): boolean {
  return (
    conferenciaModalOpen ||
    conferenciaLancamentoDepth > 0 ||
    isConferenciaAprovacaoSyncQueueActive() ||
    isConferenciaOperacionalPushScopeActive()
  );
}

/** Sync automático da gestão — bloqueia só com modal aberto ou aprovação em andamento na UI. */
export function shouldBlockStaffAutoSyncDuringConferencia(userInitiated?: boolean): boolean {
  if (userInitiated) return false;
  if (!staffSessionActive()) return false;
  return conferenciaModalOpen || conferenciaLancamentoDepth > 0;
}

function staffSessionActive(): boolean {
  const session = getSession();
  if (!session?.role) return false;
  return isStaffRole(session.role as UserRole);
}

/** Rebaixa sync automático durante conferência — não bloqueia «Atualizar agora». */
export function capStaffConferenciaSyncTierRequest(
  tier: SyncTier,
  force: boolean,
  userInitiated?: boolean
): { tier: SyncTier; force: boolean } {
  if (!staffSessionActive() || !isStaffConferenciaSyncTierCapActive()) {
    return { tier, force };
  }
  if (userInitiated) return { tier, force };
  if (TIER_RANK[tier] > TIER_RANK[CONFERENCIA_CAP_TIER]) {
    return { tier: CONFERENCIA_CAP_TIER, force: false };
  }
  if (tier === CONFERENCIA_CAP_TIER) {
    return { tier, force: false };
  }
  return { tier, force };
}

export function applyStaffConferenciaCapToSyncRequest(req: SyncTierRequest): SyncTierRequest {
  const capped = capStaffConferenciaSyncTierRequest(req.tier, req.force, req.userInitiated);
  return { ...req, tier: capped.tier, force: capped.force };
}

/** Somente testes. */
export function resetStaffConferenciaSyncTierForTests(): void {
  conferenciaModalOpen = false;
  conferenciaLancamentoDepth = 0;
}
