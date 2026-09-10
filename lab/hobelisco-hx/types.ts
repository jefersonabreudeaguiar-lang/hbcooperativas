/** HOBELISCO HX V1 — tipos centrais (lab only) */

export type HobeliscoState =
  | "BIRTH"
  | "BOOT"
  | "AWAKE"
  | "WATCHING"
  | "LEARNING"
  | "DEFENDING"
  | "RECOVERING"
  | "FORTRESS"
  | "HIBERNATING"
  | "SAFE_MODE"
  | "FAILED"
  | "DEAD"
  | "ANALYSIS"
  | "REINCARNATING";

export type FortressLevel = "NORMAL" | "ELEVATED" | "DEFENSIVE" | "FORTRESS";

export type DefenseBudgetLevel = FortressLevel;

export type HobeliscoMode = "observe" | "arena" | "canary" | "active";

export type RiskLevel = "L0_OBSERVE" | "L1_PREVENT" | "L2_SAFE_REPAIR" | "L3_HUMAN_REQUIRED";

export type RuleSeverity = "low" | "medium" | "high" | "critical";

export type RuleState = "active" | "disabled" | "canary";

export interface HobeliscoRule {
  id: string;
  category: "AUTH" | "AUTHZ" | "SYNC" | "DATA" | "CREDIT" | "SYSTEM";
  description: string;
  severity: RuleSeverity;
  policy: string;
  recommendedAction: string;
  state: RuleState;
}

export type SensorKind =
  | "AUTH"
  | "SYNC"
  | "DATABASE"
  | "API"
  | "HB_CREDIT"
  | "PERFORMANCE"
  | "INTEGRITY"
  | "CACHE"
  | "DEVICE"
  | "BEHAVIOR";

export type SensorSignalLevel = "OK" | "WARN" | "CRIT" | "UNKNOWN";

export interface SensorSignal {
  sensor: SensorKind;
  level: SensorSignalLevel;
  message: string;
  observedAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface HobeliscoFlags {
  enabled: boolean;
  mode: HobeliscoMode;
  autoRepair: boolean;
  fortress: boolean;
  arena: boolean;
}

export interface Heartbeat {
  healthScore: number;
  state: HobeliscoState;
  fortressLevel: FortressLevel;
  threatCount: number;
  selfWatchOk: boolean;
  lines: string[];
  emittedAt: string;
}

export interface HealthDimension {
  id: string;
  label: string;
  score: number;
  status: SensorSignalLevel;
}

export interface CooperativeHealth {
  cooperativeCnpj: string;
  cooperativeName: string;
  score: number;
  status: SensorSignalLevel;
}

export interface HealthReport {
  overall: number;
  dimensions: HealthDimension[];
  cooperatives: CooperativeHealth[];
  computedAt: string;
}

export interface MemoryEvent {
  id: string;
  layer: "short" | "mid" | "long";
  kind: string;
  summary: string;
  origin: string;
  context: string;
  result: string;
  defenseUsed: string | null;
  efficacy: number | null;
  at: string;
}

export interface AuditChainEvent {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  eventHash: string;
  previousEventHash: string | null;
  at: string;
}

export interface DefenseAntibody {
  id: string;
  name: string;
  bornFrom: string;
  ruleId?: string;
  version: string;
  reusable: boolean;
}

export interface ThreatFingerprint {
  id: string;
  fingerprint: string;
  sequence: string[];
  endpoint?: string;
  cooperativeCnpj?: string;
  userRole?: string;
  severity: "low" | "medium" | "high" | "critical";
  classifiedAt: string;
}

export type ImmunePhase = "PREVENT" | "CONTAIN" | "REPAIR" | "VALIDATE";

export interface ImmuneAction {
  phase: ImmunePhase;
  action: string;
  approved: boolean;
  requiresHuman: boolean;
  at: string;
}

export interface GuardianResult {
  ok: boolean;
  stage: string;
  rollback: boolean;
  humanRequired: boolean;
  details: string[];
}

export interface CircuitBreakerState {
  open: boolean;
  failures: number;
  threshold: number;
  lastReason: string | null;
}

export interface DefenseBudget {
  level: DefenseBudgetLevel;
  activeSensors: number;
  maxSensors: number;
  description: string;
}

export interface AutoRepairResult {
  allowed: boolean;
  action: string;
  rolledBack: boolean;
  humanRequired: boolean;
  message: string;
}

export interface LearningInsight {
  pattern: string;
  occurrences: number;
  suggestedRuleId: string | null;
  efficacyAvg: number;
}

export interface FinancialActionAttempt {
  action: string;
  target: string;
}

export interface HobeliscoSnapshot {
  version: string;
  state: HobeliscoState;
  flags: HobeliscoFlags;
  heart: Heartbeat;
  health: HealthReport;
  fortressLevel: FortressLevel;
  defenseBudget: DefenseBudget;
  circuitBreaker: CircuitBreakerState;
  riskLevel: RiskLevel;
  sensors: SensorSignal[];
  memoryStats: { short: number; mid: number; long: number };
  recentMemory: MemoryEvent[];
  auditChainHead: AuditChainEvent | null;
  auditChainLength: number;
  defenseDnaVersion: string;
  invariants: string[];
  rulesActive: number;
  antibodies: DefenseAntibody[];
  recentThreats: ThreatFingerprint[];
  recentImmune: ImmuneAction[];
  lastGuardian: GuardianResult | null;
  learningInsights: LearningInsight[];
  manifestoPrinciples: string[];
}

export interface ArenaScenario {
  id: string;
  title: string;
  description: string;
  ruleIds?: string[];
  injectThreat?: Partial<ThreatFingerprint> & { sequence: string[] };
  simulateFinancialAttack?: FinancialActionAttempt;
  sensorContext?: Record<string, unknown>;
  autoRepairAction?: string;
}

export interface MandatoryTestResult {
  id: string;
  category: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ArenaReport {
  generatedAt: string;
  scenariosRun: number;
  scenariosPassed: number;
  microSimulations: number;
  microSimulationsPassed: number;
  mandatoryTests: MandatoryTestResult[];
  allMandatoryPassed: boolean;
  snapshot: HobeliscoSnapshot;
  notes: string[];
}

export interface DialogueReply {
  intent: string;
  answer: string;
  citations: string[];
  disclaimer: string;
}
