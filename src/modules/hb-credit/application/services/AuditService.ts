import type { HbCreditAuditAction } from "../../audit/actions";

export interface AuditRecordInput {
  cooperativeCnpj: string;
  actor?: string;
  actorRole?: string;
  action: HbCreditAuditAction;
  resourceType?: string;
  resourceId?: string;
  correlationId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  record(input: AuditRecordInput): Promise<void>;
}
