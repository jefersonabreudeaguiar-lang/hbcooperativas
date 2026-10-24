/**
 * Fase B — antifraude no pagamento HB (velocidade, volume, valor alto, mercado novo).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordHbCreditPhaseBGuardAudit } from "@/lib/security/platformSecurityEvents";
import { resolveHbCreditPhaseBMode, type HbCreditPhaseBMode } from "@/modules/hb-credit/shared/phaseBConfig";
import { normalizeCnpj } from "@/utils/cooperativa";

export const HB_CREDIT_STEP_UP_REQUIRED_CODE = "HB_CREDIT_STEP_UP_REQUIRED";
export const HB_CREDIT_ANTIFRAUD_BLOCKED_CODE = "HB_CREDIT_ANTIFRAUD_BLOCKED";

export const HB_CREDIT_STEP_UP_MESSAGE =
  "Por segurança, digite o PIN novamente para confirmar este pagamento.";

export const HB_CREDIT_ANTIFRAUD_BLOCKED_MESSAGE =
  "Pagamento pausado por segurança. Aguarde alguns minutos ou contate a cooperativa.";

export type HbCreditPhaseBRiskLevel = "LOW" | "ELEVATED" | "HIGH";

export type HbCreditPhaseBSignal =
  | "velocity_15m"
  | "volume_24h"
  | "high_amount_pct"
  | "high_amount_absolute"
  | "first_payment_partner";

export type HbCreditPhaseBAssessment = {
  status: "CLEAR" | "ELEVATED" | "HIGH" | "SKIPPED";
  riskLevel: HbCreditPhaseBRiskLevel;
  signals: HbCreditPhaseBSignal[];
  reasons: string[];
  metrics: {
    payments15m: number;
    volume24hCents: number;
    firstPaymentToPartner: boolean;
  };
};

export type HbCreditPhaseBPaymentContext = {
  cooperativeCnpj: string;
  cooperadoId: string;
  partnerId: string;
  amountCents: number;
  availableCents: number;
  phaseBStepUp?: boolean;
};

function assessFromSignals(
  signals: HbCreditPhaseBSignal[],
  reasons: string[],
  metrics: HbCreditPhaseBAssessment["metrics"]
): HbCreditPhaseBAssessment {
  const hasVelocity = signals.includes("velocity_15m");
  const highCount =
    (signals.includes("high_amount_absolute") ? 1 : 0) +
    (signals.includes("high_amount_pct") ? 1 : 0) +
    (signals.includes("volume_24h") ? 1 : 0);

  let riskLevel: HbCreditPhaseBRiskLevel = "LOW";
  let status: HbCreditPhaseBAssessment["status"] = "CLEAR";

  if (hasVelocity || highCount >= 2) {
    riskLevel = "HIGH";
    status = "HIGH";
  } else if (signals.length > 0) {
    riskLevel = "ELEVATED";
    status = "ELEVATED";
  }

  return { status, riskLevel, signals, reasons, metrics };
}

/** Avaliação pura (testes) — sem consulta ao banco. */
export function assessHbCreditPhaseBPaymentRisk(
  input: {
    amountCents: number;
    availableCents: number;
    payments15m: number;
    volume24hCents: number;
    firstPaymentToPartner: boolean;
  },
  mode: HbCreditPhaseBMode
): HbCreditPhaseBAssessment {
  const signals: HbCreditPhaseBSignal[] = [];
  const reasons: string[] = [];

  if (input.payments15m >= mode.maxPayments15m) {
    signals.push("velocity_15m");
    reasons.push(`Muitos pagamentos em pouco tempo (${input.payments15m}/${mode.maxPayments15m} em 15 min).`);
  }

  const projected24h = input.volume24hCents + input.amountCents;
  if (projected24h > mode.maxVolume24hCents) {
    signals.push("volume_24h");
    reasons.push(`Volume diário acima do limite (${projected24h}c / ${mode.maxVolume24hCents}c).`);
  }

  if (input.amountCents >= mode.highAmountAbsoluteCents) {
    signals.push("high_amount_absolute");
    reasons.push(`Valor acima de ${(mode.highAmountAbsoluteCents / 100).toFixed(0)} reais.`);
  }

  if (input.availableCents > 0) {
    const pct = (input.amountCents / input.availableCents) * 100;
    if (pct >= mode.highAmountPctOfAvailable) {
      signals.push("high_amount_pct");
      reasons.push(`Valor usa ${pct.toFixed(0)}% do saldo HB disponível.`);
    }
  }

  if (input.firstPaymentToPartner) {
    signals.push("first_payment_partner");
    reasons.push("Primeiro pagamento HB para este mercado.");
  }

  return assessFromSignals(signals, reasons, {
    payments15m: input.payments15m,
    volume24hCents: input.volume24hCents,
    firstPaymentToPartner: input.firstPaymentToPartner,
  });
}

async function loadPaymentVelocityMetrics(
  supabase: SupabaseClient,
  cooperativeCnpj: string,
  cooperadoId: string,
  partnerId: string
): Promise<{
  payments15m: number;
  volume24hCents: number;
  firstPaymentToPartner: boolean;
} | null> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [countRes, volumeRes, partnerRes] = await Promise.all([
    supabase
      .from("hb_credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", cooperadoId)
      .eq("event_type", "PAYMENT")
      .eq("status", "posted")
      .gte("created_at", since15m),
    supabase
      .from("hb_credit_transactions")
      .select("amount_cents")
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", cooperadoId)
      .eq("event_type", "PAYMENT")
      .eq("status", "posted")
      .gte("created_at", since24h)
      .limit(200),
    supabase
      .from("hb_credit_transactions")
      .select("id")
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", cooperadoId)
      .eq("partner_id", partnerId)
      .eq("event_type", "PAYMENT")
      .eq("status", "posted")
      .limit(1)
      .maybeSingle(),
  ]);

  if (countRes.error || volumeRes.error || partnerRes.error) return null;

  const volume24hCents = (volumeRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount_cents ?? 0),
    0
  );

  return {
    payments15m: countRes.count ?? 0,
    volume24hCents,
    firstPaymentToPartner: !partnerRes.data?.id,
  };
}

export type HbCreditPhaseBGuardResult =
  | { ok: true; assessment: HbCreditPhaseBAssessment }
  | { ok: false; error: string; code: string; assessment: HbCreditPhaseBAssessment };

export async function runHbCreditPhaseBPaymentGuard(
  supabase: SupabaseClient,
  input: HbCreditPhaseBPaymentContext
): Promise<HbCreditPhaseBGuardResult> {
  const mode = resolveHbCreditPhaseBMode();
  const skipped: HbCreditPhaseBAssessment = {
    status: "SKIPPED",
    riskLevel: "LOW",
    signals: [],
    reasons: [],
    metrics: { payments15m: 0, volume24hCents: 0, firstPaymentToPartner: false },
  };

  if (!mode.enabled) {
    return { ok: true, assessment: skipped };
  }

  const metrics = await loadPaymentVelocityMetrics(
    supabase,
    input.cooperativeCnpj,
    input.cooperadoId,
    input.partnerId
  );

  const assessment =
    metrics == null
      ? { ...skipped, reasons: ["velocity_query_failed"] }
      : assessHbCreditPhaseBPaymentRisk(
          {
            amountCents: input.amountCents,
            availableCents: input.availableCents,
            payments15m: metrics.payments15m,
            volume24hCents: metrics.volume24hCents,
            firstPaymentToPartner: metrics.firstPaymentToPartner,
          },
          mode
        );

  if (assessment.status === "CLEAR" || assessment.status === "SKIPPED") {
    return { ok: true, assessment };
  }

  const wouldBlockHigh = mode.blockHighRisk && assessment.status === "HIGH";
  const wouldStepUp =
    mode.enforceStepUp && assessment.status === "ELEVATED" && !input.phaseBStepUp;
  const wouldBlock = wouldBlockHigh;

  await recordHbCreditPhaseBGuardAudit(supabase, normalizeCnpj(input.cooperativeCnpj), {
    cooperadoId: input.cooperadoId,
    partnerId: input.partnerId,
    amountCents: input.amountCents,
    assessmentStatus: assessment.status,
    signals: assessment.signals,
    wouldBlock,
    wouldStepUp,
    shadow: mode.shadow,
    phaseBStepUpProvided: Boolean(input.phaseBStepUp),
    reasons: assessment.reasons.slice(0, 10),
    metrics: assessment.metrics,
  });

  if (mode.shadow) {
    return { ok: true, assessment };
  }

  if (wouldBlock) {
    return {
      ok: false,
      error: HB_CREDIT_ANTIFRAUD_BLOCKED_MESSAGE,
      code: HB_CREDIT_ANTIFRAUD_BLOCKED_CODE,
      assessment,
    };
  }

  if (wouldStepUp) {
    return {
      ok: false,
      error: HB_CREDIT_STEP_UP_MESSAGE,
      code: HB_CREDIT_STEP_UP_REQUIRED_CODE,
      assessment,
    };
  }

  return { ok: true, assessment };
}
