/**
 * Fase 2 — reconciliação read-only: crédito-base autoritativo × limite HB observado.
 * Não altera operacional, contas ou limites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcLimiteFromPercentual } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { resolveTetoGlobal } from "@/lib/supabase/contaCoopStorage";
import { normalizeCnpj } from "@/utils/cooperativa";

export type OperationalLimitReconciliationIssue = {
  cooperadoId: string;
  kind:
    | "limit_above_expected"
    | "limit_below_expected"
    | "base_positive_limit_zero"
    | "no_hb_account"
    | "integrity_available";
  creditoBaseAuthoritativeCents: number;
  limiteExpectedCents: number;
  limiteObservedCents: number | null;
  amountUsedCents: number | null;
  availableObservedCents: number | null;
  differenceCents: number | null;
  message: string;
};

export type OperationalLimitReconciliationResult = {
  cooperativeCnpj: string;
  cooperativaId?: string;
  tetoPercent: number | null;
  snapshotOk: boolean;
  snapshotError?: string;
  cooperadosChecked: number;
  issues: OperationalLimitReconciliationIssue[];
  creditosBaseAuthoritativeCents: Record<string, number>;
};

const LIMIT_TOLERANCE_CENTS = 1;

export async function runOperationalLimitReconciliation(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[]
): Promise<OperationalLimitReconciliationResult> {
  const digits = normalizeCnpj(cnpj);
  const empty: OperationalLimitReconciliationResult = {
    cooperativeCnpj: digits,
    tetoPercent: null,
    snapshotOk: false,
    cooperadosChecked: 0,
    issues: [],
    creditosBaseAuthoritativeCents: {},
  };

  if (digits.length !== 14 || !cooperadoIds.length) {
    return { ...empty, snapshotError: "CNPJ ou cooperados inválidos." };
  }

  const authoritative = await resolveAuthoritativeCreditBase(supabase, digits, cooperadoIds);
  if (!authoritative.ok) {
    return {
      ...empty,
      snapshotError: `${authoritative.code}: ${authoritative.message}`,
    };
  }

  const teto = await resolveTetoGlobal(supabase, digits, authoritative.creditosBaseCents);
  const tetoPercent = teto.configured ? teto.percent : null;

  const { data: accountRows } = await supabase
    .from("hb_credit_accounts")
    .select("cooperado_id, limit_released_cents, amount_used_cents, available_cents")
    .eq("cooperative_cnpj", digits)
    .in("cooperado_id", cooperadoIds);

  const accountByCoop = new Map<
    string,
    {
      cooperado_id: string;
      limit_released_cents: number;
      amount_used_cents: number;
      available_cents: number;
    }
  >();
  for (const row of accountRows ?? []) {
    const cooperadoId = String((row as { cooperado_id?: string }).cooperado_id ?? "");
    if (!cooperadoId) continue;
    accountByCoop.set(cooperadoId, {
      cooperado_id: cooperadoId,
      limit_released_cents: Number((row as { limit_released_cents?: number }).limit_released_cents),
      amount_used_cents: Number((row as { amount_used_cents?: number }).amount_used_cents),
      available_cents: Number((row as { available_cents?: number }).available_cents),
    });
  }

  const issues: OperationalLimitReconciliationIssue[] = [];

  for (const cooperadoId of cooperadoIds) {
    const creditoBaseAuthoritativeCents = Math.max(
      0,
      Math.round(Number(authoritative.creditosBaseCents[cooperadoId] ?? 0))
    );
    const limiteExpectedCents =
      tetoPercent != null ? calcLimiteFromPercentual(creditoBaseAuthoritativeCents, tetoPercent) : 0;

    const acct = accountByCoop.get(cooperadoId);
    if (!acct) {
      if (creditoBaseAuthoritativeCents > 0) {
        issues.push({
          cooperadoId,
          kind: "no_hb_account",
          creditoBaseAuthoritativeCents,
          limiteExpectedCents,
          limiteObservedCents: null,
          amountUsedCents: null,
          availableObservedCents: null,
          differenceCents: null,
          message: "Crédito-base positivo sem conta HB na nuvem.",
        });
      }
      continue;
    }

    const limiteObservedCents = Number(acct.limit_released_cents);
    const amountUsedCents = Number(acct.amount_used_cents);
    const availableObservedCents = Number(acct.available_cents);

    if (
      Number.isFinite(limiteObservedCents) &&
      Number.isFinite(amountUsedCents) &&
      Number.isFinite(availableObservedCents) &&
      limiteObservedCents - amountUsedCents !== availableObservedCents
    ) {
      issues.push({
        cooperadoId,
        kind: "integrity_available",
        creditoBaseAuthoritativeCents,
        limiteExpectedCents,
        limiteObservedCents,
        amountUsedCents,
        availableObservedCents,
        differenceCents: availableObservedCents - (limiteObservedCents - amountUsedCents),
        message: "available_cents diverge de limit_released − amount_used.",
      });
    }

    if (tetoPercent == null) continue;

    const diff = limiteObservedCents - limiteExpectedCents;
    if (Math.abs(diff) <= LIMIT_TOLERANCE_CENTS) continue;

    if (creditoBaseAuthoritativeCents > 0 && limiteObservedCents === 0) {
      issues.push({
        cooperadoId,
        kind: "base_positive_limit_zero",
        creditoBaseAuthoritativeCents,
        limiteExpectedCents,
        limiteObservedCents,
        amountUsedCents,
        availableObservedCents,
        differenceCents: diff,
        message: "Base autoritativa positiva com limite HB zerado.",
      });
      continue;
    }

    if (limiteObservedCents > limiteExpectedCents + LIMIT_TOLERANCE_CENTS) {
      issues.push({
        cooperadoId,
        kind: "limit_above_expected",
        creditoBaseAuthoritativeCents,
        limiteExpectedCents,
        limiteObservedCents,
        amountUsedCents,
        availableObservedCents,
        differenceCents: diff,
        message: "Limite HB acima do esperado (teto% × crédito-base autoritativo).",
      });
    } else if (limiteObservedCents + LIMIT_TOLERANCE_CENTS < limiteExpectedCents) {
      issues.push({
        cooperadoId,
        kind: "limit_below_expected",
        creditoBaseAuthoritativeCents,
        limiteExpectedCents,
        limiteObservedCents,
        amountUsedCents,
        availableObservedCents,
        differenceCents: diff,
        message: "Limite HB abaixo do esperado (sync atrasado ou compras ativas).",
      });
    }
  }

  return {
    cooperativeCnpj: digits,
    cooperativaId: authoritative.cooperativaId,
    tetoPercent,
    snapshotOk: true,
    cooperadosChecked: cooperadoIds.length,
    issues,
    creditosBaseAuthoritativeCents: authoritative.creditosBaseCents,
  };
}
