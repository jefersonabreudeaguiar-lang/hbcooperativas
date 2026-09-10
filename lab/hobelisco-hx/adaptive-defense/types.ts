/** Adaptive Active Defense — tipos centrais LAB-HARDENED */

export type ThreatFamilyId =
  | "T01_AUTH"
  | "T02_AUTHZ"
  | "T03_INJECTION"
  | "T04_WEB_API"
  | "T05_CRYPTO"
  | "T06_SESSION"
  | "T07_RATE"
  | "T08_SUPPLY"
  | "T09_CONFIG"
  | "T10_INTEGRITY"
  | "T11_SYNC"
  | "T12_HB_CREDIT"
  | "T13_ADMIN"
  | "T14_INSIDER";

export type AttackChainStage =
  | "RECON"
  | "INITIAL_ACCESS"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "EXECUTION"
  | "PERSISTENCE"
  | "PRIVILEGE"
  | "DATA_ACCESS"
  | "DATA_MANIPULATION"
  | "EXFILTRATION"
  | "IMPACT";

export type ScenarioSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ScenarioPhase =
  | "GENERATED"
  | "VALIDATED"
  | "EXECUTED"
  | "OBSERVED"
  | "CLASSIFIED"
  | "SCORED";

export type ScenarioOutcome =
  | "BLOCKED"
  | "DETECTED_ONLY"
  | "MISSED"
  | "FALSE_POSITIVE"
  | "ERROR"
  | "INCONCLUSIVE";

export type CampaignMode = "SMOKE" | "REGRESSION" | "FULL" | "ADVERSARIAL" | "CHAOS" | "NIGHTLY";

export type CyberDefenseAction =
  | "REJECT"
  | "RATE_LIMIT"
  | "BACKOFF"
  | "TEMPORARY_BLOCK"
  | "SESSION_INVALIDATION"
  | "QUARANTINE"
  | "REPLAY_REJECTION"
  | "PAYLOAD_REJECTION";

export type LearningCandidateStatus =
  | "PROPOSED"
  | "SIMULATING"
  | "VALIDATED"
  | "REJECTED"
  | "APPROVED"
  | "DEPLOYED"
  | "ROLLED_BACK";

export type PolicyDeploymentStage = "LAB" | "STAGING" | "CANARY" | "PRODUCTION";

export interface ThreatKnowledgeEntry {
  id: string;
  family: ThreatFamilyId;
  technique: string;
  category: string;
  indicators: string[];
  detection: string;
  mitigation: string;
  severity: ScenarioSeverity;
  source: string;
  sourceVersion: string;
  retrievedAt: string;
}

export interface GeneratedScenario {
  scenarioId: string;
  campaignId: string;
  family: ThreatFamilyId;
  vector: string;
  route: string;
  identityState: string;
  timingMs: number;
  frequency: number;
  sequence: string[];
  chainStage: AttackChainStage;
  severity: ScenarioSeverity;
  defenseState: string;
  isLegitimate: boolean;
  isUnknownVariant: boolean;
  seed: number;
  phase: ScenarioPhase;
}

export interface ScenarioExecutionResult {
  scenarioId: string;
  outcome: ScenarioOutcome;
  defenseAction: CyberDefenseAction | null;
  detected: boolean;
  blocked: boolean;
  latencyMs: number;
  policyVersion: string;
  error?: string;
}

export interface DefenseLearningCandidate {
  id: string;
  sourceIncidentIds: string[];
  sourceScenarioIds: string[];
  attackFamily: ThreatFamilyId;
  observedPattern: string;
  proposedDefense: string;
  expectedBenefit: string;
  falsePositiveRisk: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  createdAt: string;
  status: LearningCandidateStatus;
}

export interface DefensePolicyRecord {
  policyId: string;
  version: string;
  hash: string;
  rules: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  stage: PolicyDeploymentStage;
}

export interface CampaignReport {
  campaignId: string;
  mode: "LAB-HARDENED-ADAPTIVE";
  scenariosGenerated: number;
  scenariosExecuted: number;
  blocked: number;
  detectedOnly: number;
  missed: number;
  falsePositive: number;
  inconclusive: number;
  errors: number;
  coverage: Record<string, { total: number; blocked: number; detected: number; missed: number; fp: number }>;
  gaps: string[];
  learningCandidates: DefenseLearningCandidate[];
  policyVersion: string;
  threatKnowledgeVersion: string;
  generatorVersion: string;
  seed: number;
  financialMutations: number;
  externalTargets: number;
  defenseCoverageScore: number;
  preventionRate: number;
  detectionRate: number;
  falsePositiveRate: number;
  status: "GREEN" | "YELLOW" | "RED";
  executedAt: string;
  durationMs: number;
}
