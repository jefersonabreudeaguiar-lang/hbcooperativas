/** Tipos do ambiente LAB fictício — sem dados reais */

export type LabResourceKind =
  | "LAB_MEMORY"
  | "LAB_DATABASE"
  | "LAB_EVENT_BUS"
  | "LAB_ACTORS"
  | "LAB_ARENA"
  | "LAB_COOPERATIVES"
  | "LAB_MARKETS";

export type BlockedResourceKind =
  | "PROD_DATABASE"
  | "PROD_AUTH"
  | "PROD_HB_CREDIT"
  | "PROD_LEDGER"
  | "PROD_API"
  | "PRODUCTION"
  | "STAGING"
  | "REAL_DATABASE"
  | "REAL_HB_CREDIT"
  | "REAL_LEDGER"
  | "REAL_USER"
  | "REAL_PAYMENT";

export type LabEventType =
  | "auth_failure"
  | "auth_success"
  | "sync_conflict"
  | "api_latency"
  | "database_error"
  | "integrity_change"
  | "hb_credit_anomaly"
  | "cache_failure"
  | "device_change"
  | "behavior_anomaly"
  | "normal_operation"
  | "critical_wake";

export interface LabEvent {
  eventId: string;
  timestamp: string;
  type: LabEventType;
  source: string;
  cooperativeId: string;
  actorId: string;
  metadata: Record<string, string | number | boolean>;
}

export interface LabCooperative {
  id: string;
  name: string;
  cnpj: string;
  users: string[];
}

export interface LabUser {
  id: string;
  name: string;
  cooperativeId: string;
  role: string;
}

export interface LabMarket {
  id: string;
  name: string;
  cooperativeIds: string[];
}

export interface LabCooperado {
  id: string;
  name: string;
  cooperativeId: string;
}

export interface BoundaryBlockResult {
  blocked: true;
  reason: "BLOCKED_BY_LAB_BOUNDARY";
  resource: string;
  auditKind: "LAB_BOUNDARY_BLOCK";
}

export interface BoundaryAllowResult {
  blocked: false;
  resource: LabResourceKind;
}

export type BoundaryResult = BoundaryBlockResult | BoundaryAllowResult;
