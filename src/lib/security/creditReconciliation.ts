/**
 * Reconciliação read-only HB Créditos — detecta divergências sem mutar dados.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCreditObservation,
  evaluateCreditObservation,
  filterActionableFindings,
} from "@/lib/lab/hbCreditWatch/rules";
import type { CreditAccountRow } from "@/lib/lab/hbCreditWatch/types";
import { recordCreditReconciliationAlerts } from "@/lib/security/platformSecurityEvents";

const TABLE = "hb_credit_accounts";

function mapRow(row: Record<string, unknown>): CreditAccountRow | null {
  const cooperadoId = String(row.cooperado_id ?? "");
  if (!cooperadoId) return null;
  return {
    accountId: cooperadoId,
    cooperadoId,
    limitCents: Number(row.limit_released_cents),
    usedCents: Number(row.amount_used_cents),
    availableCents: Number(row.available_cents),
  };
}

export interface CreditReconciliationResult {
  cooperativeCnpj: string;
  accountsChecked: number;
  issues: Array<{
    accountId: string;
    eventType: string;
    expectedCents: number | null;
    observedCents: number | null;
    differenceCents: number | null;
  }>;
}

export async function runCreditReconciliationForCoop(
  supabase: SupabaseClient,
  cooperativeCnpj: string
): Promise<CreditReconciliationResult> {
  const digits = cooperativeCnpj.replace(/\D/g, "");
  const observedAt = new Date().toISOString();
  const snapshotId = `recon_${digits}_${Date.now()}`;

  const { data, error } = await supabase
    .from(TABLE)
    .select("cooperado_id, limit_released_cents, amount_used_cents, available_cents")
    .eq("cooperative_cnpj", digits)
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  const issues: CreditReconciliationResult["issues"] = [];

  for (const raw of data ?? []) {
    const row = mapRow(raw as Record<string, unknown>);
    if (!row) continue;
    if ([row.limitCents, row.usedCents, row.availableCents].some((n) => !Number.isFinite(n))) {
      issues.push({
        accountId: row.accountId,
        eventType: "credit_integrity_invalid_values",
        expectedCents: null,
        observedCents: null,
        differenceCents: null,
      });
      continue;
    }

    const obs = buildCreditObservation(digits, row, observedAt);
    const findings = filterActionableFindings(evaluateCreditObservation(obs, snapshotId));
    for (const f of findings) {
      issues.push({
        accountId: f.accountId,
        eventType: f.eventType,
        expectedCents: f.expectedCents,
        observedCents: f.observedCents,
        differenceCents: f.differenceCents,
      });
    }
  }

  if (issues.length > 0) {
    await recordCreditReconciliationAlerts(
      supabase,
      digits,
      issues.map((i) => ({
        eventType: i.eventType,
        accountId: i.accountId,
        differenceCents: i.differenceCents,
      }))
    );
  }

  return {
    cooperativeCnpj: digits,
    accountsChecked: data?.length ?? 0,
    issues,
  };
}
