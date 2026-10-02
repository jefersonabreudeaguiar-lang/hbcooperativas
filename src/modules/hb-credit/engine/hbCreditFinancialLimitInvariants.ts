/**
 * Invariantes P0 limite HB × snapshot — espelha hb_credit_validate_financial_limit_row (SQL).
 * Usado em testes fail-closed sem depender de Postgres.
 */

import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";

export const HB_CREDIT_LIMIT_DIVERGENT_CODE = "HB_CREDIT_LIMIT_DIVERGENT";
export const HB_CREDIT_LIMIT_SNAPSHOT_MISSING_CODE = "HB_CREDIT_LIMIT_SNAPSHOT_MISSING";

export type HbFinancialLimitRowSnapshot = {
  limitReleasedCents: number;
  capCents: number | null;
  amountUsedCents: number;
  baseSnapshotCents: number | null;
  ceilingSnapshotCents: number | null;
  syncState?: string;
};

export type HbFinancialLimitValidation =
  | { ok: true }
  | { ok: false; errorCode: string; error: string };

export function validateHbFinancialLimitRow(row: HbFinancialLimitRowSnapshot): HbFinancialLimitValidation {
  const limit = Math.max(0, Math.round(Number(row.limitReleasedCents) || 0));
  const cap = row.capCents == null ? limit : Math.max(0, Math.round(Number(row.capCents)));
  const used = Math.max(0, Math.round(Number(row.amountUsedCents) || 0));
  const base = row.baseSnapshotCents;
  const ceiling = row.ceilingSnapshotCents;

  if (base == null || ceiling == null) {
    return {
      ok: false,
      errorCode: HB_CREDIT_LIMIT_SNAPSHOT_MISSING_CODE,
      error: "Snapshot de limite HB ausente.",
    };
  }

  if (base < 0 || ceiling < 0) {
    return {
      ok: false,
      errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
      error: "Snapshot de limite HB inválido.",
    };
  }

  if (limit < used) {
    return {
      ok: false,
      errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
      error: "Limite liberado abaixo do valor usado.",
    };
  }

  if (base === 0) {
    if (limit > used) {
      return {
        ok: false,
        errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
        error: "Limite HB acima do uso permitido com base zero.",
      };
    }
    if (ceiling !== limit) {
      return {
        ok: false,
        errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
        error: "Teto snapshot incoerente com limite (base zero).",
      };
    }
    if (cap !== limit) {
      return {
        ok: false,
        errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
        error: "Cap financeiro incoerente com limite (base zero).",
      };
    }
    return { ok: true };
  }

  if (limit > ceiling) {
    return {
      ok: false,
      errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
      error: "Limite liberado acima do teto snapshot.",
    };
  }

  if (cap > ceiling) {
    return {
      ok: false,
      errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
      error: "Cap financeiro acima do teto snapshot.",
    };
  }

  return { ok: true };
}

/** Gate authorize (TS/modelo) após state === SYNCED. */
export function authorizeHbFinancialLimitFailClosed(
  row: HbFinancialLimitRowSnapshot,
  creditDebitCents: number
): HbFinancialLimitValidation & { disponivelCents?: number } {
  if (String(row.syncState ?? "SYNCED") !== "SYNCED") {
    return {
      ok: false,
      errorCode: "HB_CREDIT_STATE_STALE",
      error: "O crédito está sendo atualizado. Aguarde alguns instantes e tente novamente.",
    };
  }

  const invariant = validateHbFinancialLimitRow(row);
  if (!invariant.ok) return invariant;

  const disponivel = hbCreditEffectiveDisponivelCents(
    row.limitReleasedCents,
    row.capCents,
    row.amountUsedCents
  );

  const base = row.baseSnapshotCents!;
  const debit = Math.max(0, Math.round(creditDebitCents));
  if (base === 0 && disponivel <= 0 && debit > 0) {
    return {
      ok: false,
      errorCode: HB_CREDIT_LIMIT_DIVERGENT_CODE,
      error: "Crédito HB indisponível com base financeira zerada.",
    };
  }

  if (disponivel < debit) {
    return { ok: false, errorCode: "HB_CREDIT_INSUFFICIENT", error: "Limite insuficiente." };
  }

  return { ok: true, disponivelCents: disponivel };
}
