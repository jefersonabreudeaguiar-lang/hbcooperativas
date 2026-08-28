import type { IntentStatus, ParceiroStatus, RecebivelStatus } from "../../types";

/** Mapeamento API (PT) ↔ persistência (EN) — centralizado. */

const PARTNER_TO_DB: Record<ParceiroStatus, string> = {
  pendente: "PENDING",
  ativo: "ACTIVE",
  bloqueado: "BLOCKED",
};

const PARTNER_FROM_DB: Record<string, ParceiroStatus> = {
  PENDING: "pendente",
  ACTIVE: "ativo",
  BLOCKED: "bloqueado",
};

const INTENT_TO_DB: Partial<Record<IntentStatus, string>> = {
  criada: "CREATED",
  pendente: "PENDING",
  em_autorizacao: "AUTHORIZING",
  confirmada: "CONFIRMED",
  expirada: "EXPIRED",
  cancelada: "CANCELLED",
  recusada: "DECLINED",
  estorno_pendente: "REFUND_PENDING",
  estornada: "REFUNDED",
};

const INTENT_FROM_DB: Record<string, IntentStatus> = {
  CREATED: "criada",
  PENDING: "pendente",
  AUTHORIZING: "em_autorizacao",
  CONFIRMED: "confirmada",
  DECLINED: "recusada",
  EXPIRED: "expirada",
  CANCELLED: "cancelada",
  REFUND_PENDING: "estorno_pendente",
  REFUNDED: "estornada",
};

const RECEIVABLE_FROM_DB: Record<string, RecebivelStatus> = {
  OPEN: "aberto",
  ELIGIBLE: "elegivel",
  PROCESSING: "em_processamento",
  SETTLED: "liquidado",
  BLOCKED_FOR_REVIEW: "bloqueado_revisao",
};

export function partnerStatusToDb(status: ParceiroStatus): string {
  return PARTNER_TO_DB[status];
}

export function partnerStatusFromDb(status: string): ParceiroStatus {
  return PARTNER_FROM_DB[status] ?? "pendente";
}

export function intentStatusToDb(status: IntentStatus): string {
  return INTENT_TO_DB[status] ?? status.toUpperCase();
}

export function intentStatusFromDb(status: string): IntentStatus {
  return INTENT_FROM_DB[status] ?? "pendente";
}

export function receivableStatusFromDb(status: string): RecebivelStatus {
  return RECEIVABLE_FROM_DB[status] ?? "aberto";
}

export function apiParceiroStatus(input: string): ParceiroStatus {
  if (input === "ativo" || input === "ACTIVE") return "ativo";
  if (input === "bloqueado" || input === "BLOCKED") return "bloqueado";
  return "pendente";
}
