/** Tipos da Timeline LAB — dados reais do runtime */

export type TimelineFilterCategory =
  | "ALL"
  | "AUTH"
  | "API"
  | "SYNC"
  | "DATABASE"
  | "HB_CREDIT"
  | "FINANCIAL"
  | "INTEGRITY"
  | "PERFORMANCE"
  | "DEVICE"
  | "BEHAVIOR"
  | "DEFENSE"
  | "GUARDIAN"
  | "LEARNING"
  | "DEATH"
  | "REINCARNATION";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  sequence: number;
  state: string;
  organ: string;
  eventType: string;
  risk: string;
  threatDNA: string | null;
  defense: string | null;
  action: string;
  result: string;
  severity: "low" | "medium" | "high" | "critical" | "info";
  filterCategory: TimelineFilterCategory;
  incidentId?: string;
  pipeline?: string[];
  explanation?: string;
  contained?: boolean;
  falsePositive?: boolean;
  falseNegative?: boolean;
  humanRequired?: boolean;
}

export interface LifeStateTransition {
  from: string;
  to: string;
  at: string;
  auditKind: string;
}

export interface TimelineSnapshotView {
  lifeState: string;
  vitality: number;
  risk: string;
  dna: string;
  memory: { short: number; mid: number; long: number };
  antibodies: number;
  activeDefense: string;
  worldEvents: number;
  clock: string;
  auditLength: number;
  immunityReadiness: number;
  immunityClass: string;
}

export interface ReplayComparison {
  incidentId: string;
  match: boolean;
  divergence?: string;
  original: { state: string; health: number; result: string };
  replayed: { state: string; health: number; result: string };
  divergedAt?: string;
}
