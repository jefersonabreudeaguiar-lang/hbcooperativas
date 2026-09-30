/**
 * Fase 2.1 — Sincronização autoritativa do limite HB após pagamento confirmado (operacional).
 * Não altera authorize/refund; recalcula limite absoluto via sync existente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcLimiteFromPercentual } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { pickCreditosBaseForLimitSync } from "@/modules/hb-credit/engine/creditBaseValidation";
import {
  runOperationalLimitReconciliation,
  type OperationalLimitReconciliationIssue,
} from "@/modules/hb-credit/engine/creditOperationalReconciliation";
import { getLimiteCooperado, resolveTetoGlobal, syncLimitesCooperadosFromCreditoBase } from "@/lib/supabase/contaCoopStorage";
import { recordPostPaymentHbSyncAudit } from "@/lib/security/platformSecurityEvents";
import { normalizeCnpj } from "@/utils/cooperativa";
import { markHbCreditLimitSynced } from "@/modules/hb-credit/engine/hbCreditLimitSyncState";

export type PostPaymentHbLimitSyncStatus = "SYNCED" | "FAILED" | "DIVERGENT";

export type PostPaymentHbReconciliationStatus = "ALIGNED" | "DIVERGENT" | "SKIPPED";

export type PostPaymentHbSyncResult = {
  status: PostPaymentHbLimitSyncStatus;
  reconciliationStatus: PostPaymentHbReconciliationStatus;
  paymentId: string;
  cooperadoId: string;
  creditoBaseBeforeCents: number | null;
  creditoBaseAfterCents: number | null;
  limiteBeforeCents: number | null;
  limiteExpectedCents: number | null;
  limiteAfterCents: number | null;
  errorCode?: string;
  errorMessage?: string;
  operationalIssues?: OperationalLimitReconciliationIssue[];
};

const LIMIT_TOLERANCE_CENTS = 1;

export function evaluatePostPaymentHbAlignment(opts: {
  limiteExpectedCents: number | null;
  limiteAfterCents: number | null;
  operationalIssues: OperationalLimitReconciliationIssue[];
}): PostPaymentHbReconciliationStatus {
  if (opts.limiteExpectedCents == null || opts.limiteAfterCents == null) {
    return opts.operationalIssues.length ? "DIVERGENT" : "SKIPPED";
  }
  if (opts.operationalIssues.length > 0) return "DIVERGENT";
  if (Math.abs(opts.limiteAfterCents - opts.limiteExpectedCents) <= LIMIT_TOLERANCE_CENTS) {
    return "ALIGNED";
  }
  return "DIVERGENT";
}

/**
 * Recalcula limite HB a partir do operacional já persistido (pagamento confirmado).
 * Idempotente: várias execuções convergem para o mesmo limite absoluto.
 */
export async function syncHbLimitAfterCooperadoPayment(
  supabase: SupabaseClient,
  opts: {
    cnpj: string;
    cooperadoId: string;
    paymentId: string;
    actorUserId: string;
    /** Snapshot opcional do crédito-base antes da confirmação (mesmo authoritative). */
    creditoBaseBeforeCents?: number | null;
  }
): Promise<PostPaymentHbSyncResult> {
  const digits = normalizeCnpj(opts.cnpj);
  const cooperadoId = String(opts.cooperadoId ?? "").trim();
  const baseResult: PostPaymentHbSyncResult = {
    status: "FAILED",
    reconciliationStatus: "SKIPPED",
    paymentId: opts.paymentId,
    cooperadoId,
    creditoBaseBeforeCents: opts.creditoBaseBeforeCents ?? null,
    creditoBaseAfterCents: null,
    limiteBeforeCents: null,
    limiteExpectedCents: null,
    limiteAfterCents: null,
  };

  if (digits.length !== 14 || !cooperadoId) {
    return {
      ...baseResult,
      errorCode: "INVALID_INPUT",
      errorMessage: "CNPJ ou cooperado inválido.",
    };
  }

  const limiteBefore = await getLimiteCooperado(supabase, digits, cooperadoId);
  baseResult.limiteBeforeCents = limiteBefore?.limiteLiberadoCents ?? 0;

  const authoritative = await resolveAuthoritativeCreditBase(supabase, digits, [cooperadoId]);
  if (!authoritative.ok) {
    const failed: PostPaymentHbSyncResult = {
      ...baseResult,
      errorCode: authoritative.code,
      errorMessage: authoritative.message,
    };
    await recordPostPaymentHbSyncAudit(supabase, digits, {
      ...failed,
      event: "HB_LIMIT_SYNC_FAILED",
    });
    return failed;
  }

  const picked = pickCreditosBaseForLimitSync({
    authoritative: authoritative.creditosBaseCents,
    cooperadoIds: [cooperadoId],
  });

  baseResult.creditoBaseAfterCents = picked.creditosBaseCents[cooperadoId] ?? 0;

  const teto = await resolveTetoGlobal(supabase, digits, picked.creditosBaseCents);
  baseResult.limiteExpectedCents =
    teto.configured && teto.percent != null
      ? calcLimiteFromPercentual(baseResult.creditoBaseAfterCents, teto.percent)
      : 0;

  const sync = await syncLimitesCooperadosFromCreditoBase(
    supabase,
    digits,
    [cooperadoId],
    picked.creditosBaseCents,
    opts.actorUserId
  );

  if (!sync.ok) {
    const failed: PostPaymentHbSyncResult = {
      ...baseResult,
      errorCode: "HB_LIMIT_SYNC_FAILED",
      errorMessage: sync.error,
    };
    await recordPostPaymentHbSyncAudit(supabase, digits, {
      ...failed,
      event: "HB_LIMIT_SYNC_FAILED",
    });
    return failed;
  }

  const limiteAfter = await getLimiteCooperado(supabase, digits, cooperadoId);
  baseResult.limiteAfterCents = limiteAfter?.limiteLiberadoCents ?? 0;

  const operational = await runOperationalLimitReconciliation(supabase, digits, [cooperadoId]);
  const reconciliationStatus = evaluatePostPaymentHbAlignment({
    limiteExpectedCents: baseResult.limiteExpectedCents,
    limiteAfterCents: baseResult.limiteAfterCents,
    operationalIssues: operational.issues,
  });

  baseResult.reconciliationStatus = reconciliationStatus;
  baseResult.operationalIssues = operational.issues.length ? operational.issues : undefined;

  if (reconciliationStatus === "DIVERGENT") {
    baseResult.status = "DIVERGENT";
    await recordPostPaymentHbSyncAudit(supabase, digits, {
      ...baseResult,
      event: "POST_PAYMENT_HB_SYNC_DIVERGENT",
    });
    return baseResult;
  }

  const syncedMark = await markHbCreditLimitSynced(supabase, {
    cnpj: digits,
    cooperadoId,
    actorUserId: opts.actorUserId,
  });
  if (!syncedMark.ok) {
    const failed: PostPaymentHbSyncResult = {
      ...baseResult,
      status: "FAILED",
      errorCode: "HB_LIMIT_SYNC_STATE_UPDATE_FAILED",
      errorMessage: syncedMark.error,
    };
    await recordPostPaymentHbSyncAudit(supabase, digits, {
      ...failed,
      event: "HB_LIMIT_SYNC_FAILED",
    });
    return failed;
  }

  baseResult.status = "SYNCED";
  await recordPostPaymentHbSyncAudit(supabase, digits, {
    ...baseResult,
    event: "POST_PAYMENT_HB_SYNC_ALIGNED",
  });
  return baseResult;
}
