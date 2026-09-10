/**
 * Levantamento de impacto se Hobelisco for ligado em produção.
 * Separado por modo: observe-only vs active defense.
 */

import type { SecurityBenchmarkReport } from "./SecurityBenchmark";

export type ProductionMode = "OFF" | "OBSERVE_ONLY" | "STAGING_FULL" | "ACTIVE_DEFENSE_CANARY";

export interface ProductionImpactSection {
  title: string;
  items: string[];
}

export interface ProductionImpactReport {
  generatedAt: string;
  currentDefault: ProductionMode;
  modes: Record<
    ProductionMode,
    {
      envFlags: string[];
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      recommended: boolean;
    }
  >;
  advantages: ProductionImpactSection[];
  disadvantages: ProductionImpactSection[];
  functionalFlowImpact: ProductionImpactSection[];
  whatWouldBlock: string[];
  whatWouldHelp: string[];
  deploymentPhases: Array<{ phase: string; actions: string[]; gate: string }>;
  benchmarkContext: Pick<
    SecurityBenchmarkReport["hobeliscoPosition"],
    "honestAppSecurityContribution" | "verdict"
  >;
}

export function buildProductionImpactReport(
  benchmark: SecurityBenchmarkReport
): ProductionImpactReport {
  return {
    generatedAt: new Date().toISOString(),
    currentDefault: "OFF",
    modes: {
      OFF: {
        envFlags: ["HB_HOBELISCO_V2_ENABLED=false", "HB_ADAPTIVE_DEFENSE_ENABLED=false"],
        riskLevel: "LOW",
        recommended: true,
      },
      OBSERVE_ONLY: {
        envFlags: [
          "HOBELISCO_ENVIRONMENT=STAGING",
          "HB_HOBELISCO_V2_ENABLED=true",
          "HB_HOBELISCO_OBSERVE_ONLY=true",
          "HB_HOBELISCO_STAGING_ENABLED=true",
        ],
        riskLevel: "LOW",
        recommended: true,
      },
      STAGING_FULL: {
        envFlags: [
          "HOBELISCO_ENVIRONMENT=STAGING",
          "HB_HOBELISCO_V2_ENABLED=true",
          "HB_HOBELISCO_CREDIT_WATCH_ENABLED=true",
          "HB_ADAPTIVE_DEFENSE_ENABLED=true (campanha LAB apenas)",
        ],
        riskLevel: "MEDIUM",
        recommended: true,
      },
      ACTIVE_DEFENSE_CANARY: {
        envFlags: [
          "ActiveDefenseExecutor em % tráfego",
          "REJECT/RATE_LIMIT inline",
          "Human approval + rollback",
        ],
        riskLevel: "HIGH",
        recommended: false,
      },
    },
    advantages: [
      {
        title: "Visibilidade de domínio",
        items: [
          "Correlaciona auth + sync + crédito + admin — WAF genérico não faz isso",
          "HB Credit Watch detecta divergência limit/used/available sem mutar dados",
          "Incidentes com fingerprint estável e playbooks determinísticos",
          "Auditoria who/what/when para compliance interno cooperativa",
        ],
      },
      {
        title: "Segurança financeira",
        items: [
          "FinancialGuard impede mutação automática de hb_credit_*",
          "Probe read-only — observe-only by design em V2 prod",
          "Confirmação humana antes de playbook outcome",
        ],
      },
      {
        title: "Evolução controlada",
        items: [
          "Campanhas LAB 10k+ cenários antes de propor política",
          "Learning candidates sem auto-deploy",
          "Rollback versionado DEFENSE-POLICY-vN",
        ],
      },
    ],
    disadvantages: [
      {
        title: "Operacional",
        items: [
          "Mais uma camada para operar — alertas exigem triagem humana",
          "Schema observability Supabase ainda necessário para persistência full",
          "Cron credit-watch precisa CRON_SECRET e tuning de intervalo",
          "Curva de aprendizado — painel admin + LAB separados",
        ],
      },
      {
        title: "Performance",
        items: [
          "Middleware ingest adiciona latência (async schedule, ~1–5ms típico)",
          "CorrelationEngine em burst pode pressionar memória in-process",
          "Campanha 10k não roda em prod — mas nightly LAB consome CPU CI",
        ],
      },
      {
        title: "Risco se mal configurado",
        items: [
          "ACTIVE_DEFENSE em prod sem canary → FP bloqueia cooperado legítimo",
          "HB_HOBELISCO_V2 em prod sem STAGING → observação incompleta",
          "Alert fatigue se threshold confiança baixo demais",
        ],
      },
    ],
    functionalFlowImpact: [
      {
        title: "Login / auth",
        items: [
          "Observe: registra falhas, correlaciona burst — usuário não percebe",
          "Active (não recomendado): RATE_LIMIT após N falhas pode atrasar login legítimo em rede compartilhada",
        ],
      },
      {
        title: "Sync offline cooperativa",
        items: [
          "Observe: detecta replay/duplicata/conflict — não rejeita sync válido",
          "Active: REPLAY_REJECTION mal calibrado pode bloquear reconnect mobile legítimo",
        ],
      },
      {
        title: "HB Credit",
        items: [
          "Observe: alerta admin divergência — cooperado continua operando",
          "Nunca: alteração automática de saldo/limite (bloqueado por design)",
        ],
      },
      {
        title: "Admin / responsável",
        items: [
          "Observe: sequência admin anômala gera incidente ≥70% confiança",
          "Playbook só após CONFIRMED humano — não trava admin automaticamente em V2",
        ],
      },
      {
        title: "APIs públicas",
        items: [
          "Middleware observa /api/* exceto /api/lab/hobelisco",
          "Paths em publicApiPaths continuam isentos de auth — Hobelisco não corrige misconfig",
        ],
      },
    ],
    whatWouldBlock: [
      "Active defense inline sem 30+ dias observe baseline",
      "HB_ADAPTIVE_DEFENSE_ENABLED=true em NODE_ENV=production (fail-closed hoje)",
      "Learning candidate → DEPLOYED sem APPROVED humano",
      "Qualquer mutação financeira detectada em campanha (gate RED)",
      "Persistência Supabase não aplicada — incidentes voláteis em restart",
    ],
    whatWouldHelp: [
      "Detecção precoce de abuso credit/sync antes de auditoria manual",
      "Evidência estruturada para incident response interno",
      "Regressão contínua LAB — nova release não quebra defesa silenciosamente",
      "Complemento a RLS — detecta abuso mesmo com token válido",
    ],
    deploymentPhases: [
      {
        phase: "1 — STAGING observe-only (2–4 semanas)",
        actions: [
          "HB_HOBELISCO_V2_ENABLED=true, OBSERVE_ONLY=true",
          "Aplicar schema hobelisco v2 + credit watch",
          "Medir FP de alertas, ajustar threshold confiança",
        ],
        gate: "Zero impacto funcional; incidentes revisados manualmente",
      },
      {
        phase: "2 — Credit watch cron staging",
        actions: ["HB_HOBELISCO_CREDIT_WATCH_ENABLED=true", "Intervalo 15min", "Playbooks testados"],
        gate: "Probe read-only confirmado; dedup OK",
      },
      {
        phase: "3 — Produção observe-only canary",
        actions: ["1 cooperativa piloto", "Alertas só admin", "Sem bloqueio inline"],
        gate: "FP < 1/semana; latência p95 < +10ms",
      },
      {
        phase: "4 — LAB nightly + human policy (contínuo)",
        actions: ["npm run lab:hobelisco:adaptive-defense nightly CI", "Review learning candidates"],
        gate: "GREEN + zero financial mutations",
      },
      {
        phase: "5 — Active defense (opcional, futuro)",
        actions: ["CANARY 1% tráfego", "Só REJECT injection/replay", "Rollback automático"],
        gate: "Human approval + regression 10k + FP lab < 0.1%",
      },
    ],
    benchmarkContext: {
      honestAppSecurityContribution: benchmark.hobeliscoPosition.honestAppSecurityContribution,
      verdict: benchmark.hobeliscoPosition.verdict,
    },
  };
}
