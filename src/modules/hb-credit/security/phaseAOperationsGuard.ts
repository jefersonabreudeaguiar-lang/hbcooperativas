/**
 * Fase A — reconciliação contínua antes de operações HB (pagamento / intent).
 * Modo sombra: registra divergência sem bloquear (fail-closed P0/SQL permanece).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCreditObservation,
  evaluateCreditObservation,
  filterActionableFindings,
} from "@/lib/security/hbCreditReconciliation/rules";
import { recordHbCreditPhaseAGuardAudit } from "@/lib/security/platformSecurityEvents";
import { runOperationalLimitReconciliation } from "@/modules/hb-credit/engine/creditOperationalReconciliation";
import {
  validateHbFinancialLimitRow,
  type HbFinancialLimitRowSnapshot,
} from "@/modules/hb-credit/engine/hbCreditFinancialLimitInvariants";
import { HB_CREDIT_LIMIT_DIVERGENT_CODE } from "@/modules/hb-credit/engine/hbCreditLimitSyncState";
import { resolveHbCreditPhaseAMode } from "@/modules/hb-credit/shared/phaseAConfig";
import { normalizeCnpj } from "@/utils/cooperativa";

export const HB_CREDIT_RECONCILIATION_DIVERGENT_CODE = "HB_CREDIT_RECONCILIATION_DIVERGENT";

export const HB_CREDIT_RECONCILIATION_DIVERGENT_MESSAGE =
  "HB pausado para sua segurança — os valores estão sendo alinhados. Atualize o app e tente de novo; se persistir, contate a cooperativa.";

export type HbCreditPhaseAAssessment = {
  status: "ALIGNED" | "DIVERGENT" | "SKIPPED";
  reasons: string[];
  operationalIssueKinds: string[];
  accountIntegrityEvents: string[];
};

function rowToLimitSnapshot(row: Record<string, unknown>): HbFinancialLimitRowSnapshot {
  const capRaw = row.financial_limit_cap_cents;
  const cap = capRaw == null || capRaw === "" ? null : Number(capRaw);
  const baseRaw = row.financial_limit_base_cents;
  const base = baseRaw == null || baseRaw === "" ? null : Number(baseRaw);
  const ceilingRaw = row.financial_limit_ceiling_cents;
  const ceiling = ceilingRaw == null || ceilingRaw === "" ? null : Number(ceilingRaw);
  return {
    limitReleasedCents: Number(row.limit_released_cents ?? 0),
    capCents: cap,
    amountUsedCents: Number(row.amount_used_cents ?? 0),
    baseSnapshotCents: base,
    ceilingSnapshotCents: ceiling,
    syncState: String(row.financial_limit_sync_state ?? "SYNCED"),
  };
}

export function assessHbCreditPhaseAFromAccountRow(
  cooperativeCnpj: string,
  cooperadoId: string,
  row: Record<string, unknown>,
  operationalIssues: Array<{ kind: string; message: string }>
): HbCreditPhaseAAssessment {
  const reasons: string[] = [];
  const operationalIssueKinds = operationalIssues.map((i) => i.kind);
  for (const issue of operationalIssues) {
    reasons.push(issue.message);
  }

  const limitSnap = rowToLimitSnapshot(row);
  const invariant = validateHbFinancialLimitRow(limitSnap);
  if (!invariant.ok) {
    reasons.push(invariant.error);
  }

  const observedAt = new Date().toISOString();
  const obs = buildCreditObservation(cooperativeCnpj, {
    accountId: cooperadoId,
    cooperadoId,
    limitCents: limitSnap.limitReleasedCents,
    usedCents: limitSnap.amountUsedCents,
    availableCents: Number(row.available_cents ?? 0),
  }, observedAt);
  const integrityFindings = filterActionableFindings(
    evaluateCreditObservation(obs, `phase_a_${cooperadoId}`)
  );
  const accountIntegrityEvents = integrityFindings.map((f) => f.eventType);
  for (const f of integrityFindings) {
    reasons.push(`${f.eventType}${f.differenceCents != null ? ` (${f.differenceCents}c)` : ""}`);
  }

  const divergent =
    operationalIssues.length > 0 || !invariant.ok || integrityFindings.length > 0;

  if (divergent) {
    return {
      status: "DIVERGENT",
      reasons,
      operationalIssueKinds,
      accountIntegrityEvents,
    };
  }
  return {
    status: "ALIGNED",
    reasons: [],
    operationalIssueKinds: [],
    accountIntegrityEvents: [],
  };
}

export async function assessHbCreditPhaseAForCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  accountRow: Record<string, unknown>
): Promise<HbCreditPhaseAAssessment> {
  const mode = resolveHbCreditPhaseAMode();
  if (!mode.enabled) {
    return {
      status: "SKIPPED",
      reasons: [],
      operationalIssueKinds: [],
      accountIntegrityEvents: [],
    };
  }

  const digits = normalizeCnpj(cnpj);
  /** Sombra: só invariantes na conta (rápido no PIN). Reconciliação operacional completa fica no cron. */
  let issues: Array<{ kind: string; message: string }> = [];
  if (!mode.shadow) {
    const operational = await runOperationalLimitReconciliation(supabase, digits, [cooperadoId]);
    issues = operational.issues.map((i) => ({ kind: i.kind, message: i.message }));
  }

  return assessHbCreditPhaseAFromAccountRow(digits, cooperadoId, accountRow, issues);
}

export type HbCreditPhaseAGuardResult =
  | { ok: true; assessment: HbCreditPhaseAAssessment }
  | { ok: false; error: string; code: string; assessment: HbCreditPhaseAAssessment };

/**
 * Chamado após prepare/sync de limite — última checagem Fase A antes do authorize.
 */
export async function runHbCreditPhaseAPaymentGuard(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  accountRow: Record<string, unknown>,
  accountCooperadoId: string
): Promise<HbCreditPhaseAGuardResult> {
  const mode = resolveHbCreditPhaseAMode();
  const assessment = await assessHbCreditPhaseAForCooperado(
    supabase,
    cnpj,
    accountCooperadoId,
    accountRow
  );

  if (!mode.enabled || assessment.status === "SKIPPED" || assessment.status === "ALIGNED") {
    return { ok: true, assessment };
  }

  const wouldBlock = mode.blockOnDivergent;
  await recordHbCreditPhaseAGuardAudit(supabase, normalizeCnpj(cnpj), {
    cooperadoId: accountCooperadoId,
    requestedCooperadoId: cooperadoId,
    assessmentStatus: assessment.status,
    wouldBlock,
    shadow: mode.shadow,
    reasons: assessment.reasons.slice(0, 10),
    operationalIssueKinds: assessment.operationalIssueKinds,
    accountIntegrityEvents: assessment.accountIntegrityEvents,
  });

  if (!wouldBlock) {
    return { ok: true, assessment };
  }

  const limitInvariantOnly =
    assessment.operationalIssueKinds.length === 0 &&
    assessment.accountIntegrityEvents.length === 0;
  const code = limitInvariantOnly
    ? HB_CREDIT_LIMIT_DIVERGENT_CODE
    : HB_CREDIT_RECONCILIATION_DIVERGENT_CODE;

  return {
    ok: false,
    error: HB_CREDIT_RECONCILIATION_DIVERGENT_MESSAGE,
    code,
    assessment,
  };
}
