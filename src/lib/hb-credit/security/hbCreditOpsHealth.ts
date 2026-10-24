/**
 * Fase C — snapshot operacional HB (leitura) para responsável/tesouraria.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSecurityStackHealth } from "@/lib/security/securityStackHealth";
import { resolveHbCreditPhaseAMode } from "@/modules/hb-credit/shared/phaseAConfig";
import { resolveHbCreditPhaseBMode } from "@/modules/hb-credit/shared/phaseBConfig";
import {
  isHbCreditEnabledServer,
  isHbCreditOperationsEnabled,
} from "@/modules/hb-credit/config";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { normalizeCnpj } from "@/utils/cooperativa";

export type HbCreditOpsGuardSummary = {
  action: string;
  count24h: number;
  highPriority24h: number;
  lastAt: string | null;
};

export type HbCreditOpsHealthSnapshot = {
  checkedAt: string;
  runtime: {
    moduleEnabled: boolean;
    operationsEnabled: boolean;
    apiSecurityEnforced: boolean;
  };
  phaseA: {
    enabled: boolean;
    shadow: boolean;
    blockOnDivergent: boolean;
    label: string;
  };
  phaseB: {
    enabled: boolean;
    shadow: boolean;
    enforceStepUp: boolean;
    blockHighRisk: boolean;
    label: string;
  };
  guards24h: HbCreditOpsGuardSummary[];
  recentEvents: Array<{
    action: string;
    createdAt: string;
    priority: string;
    summary: string;
  }>;
  recommendations: string[];
  cooperadoImpact: string;
};

const GUARD_ACTIONS = [
  "credit.phase_a_guard",
  "credit.phase_b_guard",
  "credit.reconciliation_alert",
] as const;

function phaseALabel(mode: ReturnType<typeof resolveHbCreditPhaseAMode>): string {
  if (!mode.enabled) return "Desligada";
  if (mode.shadow) return "Sombra (auditoria — não bloqueia)";
  if (mode.blockOnDivergent) return "Ativa — bloqueia divergência";
  return "Ativa — sem bloqueio automático";
}

function phaseBLabel(mode: ReturnType<typeof resolveHbCreditPhaseBMode>): string {
  if (!mode.enabled) return "Desligada";
  if (mode.shadow) return "Sombra (auditoria — cooperado normal)";
  if (mode.enforceStepUp && mode.blockHighRisk) return "Enforce — 2º PIN e bloqueio alto risco";
  if (mode.enforceStepUp) return "Enforce — 2º PIN em risco médio";
  return "Ativa — sem step-up";
}

function cooperadoImpactLine(
  opsOn: boolean,
  phaseA: ReturnType<typeof resolveHbCreditPhaseAMode>,
  phaseB: ReturnType<typeof resolveHbCreditPhaseBMode>
): string {
  if (!opsOn) {
    return "Cooperado: pagamentos HB pausados até retomar operações (kill switch).";
  }
  if (!phaseB.shadow && phaseB.enforceStepUp) {
    return "Cooperado: em compras de risco, pode pedir PIN duas vezes; resto igual.";
  }
  if (!phaseA.shadow && phaseA.blockOnDivergent) {
    return "Cooperado: pagamento pode recusar se limite/dados divergirem (Fase A).";
  }
  return "Cooperado: fluxo normal (PIN → comprovante). Fases A/B só registram risco.";
}

function summarizeMetadata(action: string, metadata: Record<string, unknown> | null): string {
  if (!metadata) return action;
  const reasons = metadata.reasons;
  if (Array.isArray(reasons) && reasons.length) {
    return String(reasons[0]).slice(0, 120);
  }
  const status = metadata.assessmentStatus;
  if (status) return `${action} — ${String(status)}`;
  const count = metadata.count;
  if (count != null) return `${action} — ${count} achado(s)`;
  return action;
}

export async function buildHbCreditOpsHealth(
  supabase: SupabaseClient,
  cooperativeCnpj: string
): Promise<HbCreditOpsHealthSnapshot> {
  const digits = normalizeCnpj(cooperativeCnpj);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const phaseA = resolveHbCreditPhaseAMode();
  const phaseB = resolveHbCreditPhaseBMode();
  const opsOn = isHbCreditOperationsEnabled();

  const guards24h: HbCreditOpsGuardSummary[] = [];
  for (const action of GUARD_ACTIONS) {
    const { data, error } = await supabase
      .from("security_audit_log")
      .select("id, metadata, created_at")
      .eq("cooperativa_cnpj", digits)
      .eq("action", action)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      guards24h.push({ action, count24h: 0, highPriority24h: 0, lastAt: null });
      continue;
    }
    const rows = data ?? [];
    const highPriority24h = rows.filter((r) => {
      const p = (r.metadata as { priority?: string } | null)?.priority;
      return p === "high";
    }).length;
    guards24h.push({
      action,
      count24h: rows.length,
      highPriority24h,
      lastAt: rows[0]?.created_at ? String(rows[0].created_at) : null,
    });
  }

  const { data: recentRows } = await supabase
    .from("security_audit_log")
    .select("action, created_at, metadata")
    .eq("cooperativa_cnpj", digits)
    .in("action", [...GUARD_ACTIONS])
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(8);

  const recentEvents = (recentRows ?? []).map((row) => {
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    const priority = String(meta?.priority ?? "info");
    return {
      action: String(row.action),
      createdAt: String(row.created_at),
      priority,
      summary: summarizeMetadata(String(row.action), meta),
    };
  });

  const stack = buildSecurityStackHealth();
  const recommendations = [...stack.recommendations];
  if (guards24h.some((g) => g.highPriority24h > 3)) {
    recommendations.unshift(
      "Muitos alertas HIGH nas últimas 24 h — revise Fase B (enforce) ou pause operações HB."
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      moduleEnabled: isHbCreditEnabledServer(),
      operationsEnabled: opsOn,
      apiSecurityEnforced: isApiSecurityEnforced(),
    },
    phaseA: {
      enabled: phaseA.enabled,
      shadow: phaseA.shadow,
      blockOnDivergent: phaseA.blockOnDivergent,
      label: phaseALabel(phaseA),
    },
    phaseB: {
      enabled: phaseB.enabled,
      shadow: phaseB.shadow,
      enforceStepUp: phaseB.enforceStepUp,
      blockHighRisk: phaseB.blockHighRisk,
      label: phaseBLabel(phaseB),
    },
    guards24h,
    recentEvents,
    recommendations: recommendations.slice(0, 8),
    cooperadoImpact: cooperadoImpactLine(opsOn, phaseA, phaseB),
  };
}
