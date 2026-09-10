/** Fatias do operacional.json — lab only. */
export type OperacionalSlice =
  | "votacao"
  | "financeiro"
  | "ficha"
  | "comunicados"
  | "cadastro"
  | "outros";

export type SyncPriority = "P0" | "P1" | "P2";

export interface SliceManifest {
  slice: OperacionalSlice;
  fingerprint: string;
  byteEstimate: number;
  updatedAt: string;
}

export interface CoherenceIssue {
  code: string;
  severity: "warn" | "block";
  message: string;
}

export interface SyncScoreDimension {
  id: string;
  label: string;
  score: number;
  max: 10;
  notes: string;
}

export interface SyncAuditReport {
  generatedAt: string;
  scale: { cooperativas: number; cooperados: number };
  before: SyncScoreDimension[];
  after: SyncScoreDimension[];
  beforeOverall: number;
  afterOverall: number;
  delta: number;
  simulation: ScaleSimulationResult;
  coherence: { baselineIssues: number; proposedBlocked: number; proposedWarnings: number };
}

export interface ScaleSimulationResult {
  baseline: { edgeRequests: number; bytesTransferredMb: number; redundantPullPct: number };
  proposed: { edgeRequests: number; bytesTransferredMb: number; redundantPullPct: number };
  savingsRequestsPct: number;
  savingsBytesPct: number;
}
