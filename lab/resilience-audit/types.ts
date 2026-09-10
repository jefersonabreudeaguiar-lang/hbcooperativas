export type ScenarioSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ScenarioDomain =
  | "sync"
  | "coerencia"
  | "assinatura"
  | "capacidade"
  | "seguranca"
  | "hb-credit"
  | "notas-ficha"
  | "cobranca"
  | "caos"
  | "multi-cooperativa";

export interface ScenarioResult {
  id: string;
  domain: ScenarioDomain;
  title: string;
  severity: ScenarioSeverity;
  passed: boolean;
  weakness?: string;
  mitigation?: string;
  fixedByRound?: number;
}

export interface HardeningRound {
  round: number;
  label: string;
  enabled: string[];
  score: number;
  passed: number;
  failed: number;
  criticalOpen: number;
}

export interface ResilienceAuditReport {
  generatedAt: string;
  rounds: HardeningRound[];
  scenarios: ScenarioResult[];
  finalScore: number;
  invulnerable: boolean;
  acceptedRisks: string[];
  recommendations: string[];
  syncAuditOverall?: { before: number; after: number };
}
