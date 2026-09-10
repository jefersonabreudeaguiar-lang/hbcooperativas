/** Rule Engine determinístico — V1 */

import type { HobeliscoRule, SensorSignal, ThreatFingerprint } from "../types";

export const HOBELISCO_RULES: HobeliscoRule[] = [
  { id: "AUTH-001", category: "AUTH", description: "Bruteforce login detectado", severity: "high", policy: "rate_limit", recommendedAction: "L1_PREVENT", state: "active" },
  { id: "AUTH-002", category: "AUTH", description: "Sessão expirada em loop", severity: "medium", policy: "session_cooldown", recommendedAction: "L0_OBSERVE", state: "active" },
  { id: "AUTH-003", category: "AUTH", description: "PIN financeiro bloqueado repetido", severity: "high", policy: "pin_lockout", recommendedAction: "L1_PREVENT", state: "active" },
  { id: "AUTHZ-001", category: "AUTHZ", description: "IDOR cross-cooperativa", severity: "critical", policy: "deny_cross_cnpj", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
  { id: "AUTHZ-002", category: "AUTHZ", description: "Parceiro acessa partner_id alheio", severity: "critical", policy: "credit_guard", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
  { id: "SYNC-001", category: "SYNC", description: "Push operacional incoerente", severity: "high", policy: "block_push", recommendedAction: "L2_SAFE_REPAIR", state: "active" },
  { id: "SYNC-002", category: "SYNC", description: "Snapshot ficha fino demais", severity: "medium", policy: "repair_pull", recommendedAction: "L2_SAFE_REPAIR", state: "active" },
  { id: "SYNC-003", category: "SYNC", description: "Conflito de versão cooperado", severity: "medium", policy: "merge_guard", recommendedAction: "L1_PREVENT", state: "active" },
  { id: "DATA-001", category: "DATA", description: "Payload oversized", severity: "medium", policy: "reject_payload", recommendedAction: "L1_PREVENT", state: "active" },
  { id: "DATA-002", category: "DATA", description: "Integridade audit chain quebrada", severity: "critical", policy: "freeze_incident", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
  { id: "CREDIT-001", category: "CREDIT", description: "Tentativa duplicar liquidação", severity: "critical", policy: "idempotency", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
  { id: "CREDIT-002", category: "CREDIT", description: "Estorno duplicado", severity: "critical", policy: "refund_single", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
  { id: "CREDIT-003", category: "CREDIT", description: "Anomalia valor recebível", severity: "high", policy: "observe_credit", recommendedAction: "L0_OBSERVE", state: "active" },
  { id: "SYSTEM-001", category: "SYSTEM", description: "Migration drift detectado", severity: "high", policy: "human_migration", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
  { id: "SYSTEM-002", category: "SYSTEM", description: "Circuit breaker aberto", severity: "high", policy: "stop_repair", recommendedAction: "L3_HUMAN_REQUIRED", state: "active" },
];

export function getRule(id: string): HobeliscoRule | undefined {
  return HOBELISCO_RULES.find((r) => r.id === id);
}

export function matchRules(input: {
  threat?: ThreatFingerprint;
  sensors?: SensorSignal[];
  scenarioId?: string;
}): HobeliscoRule[] {
  const matched: HobeliscoRule[] = [];
  const seq = input.threat?.sequence.join(" ") ?? "";
  const scenario = input.scenarioId ?? "";

  if (seq.includes("login_fail") || scenario.includes("AUTH")) matched.push(getRule("AUTH-001")!);
  if (seq.includes("idor") || seq.includes("cross_coop") || scenario.includes("IDOR")) matched.push(getRule("AUTHZ-001")!);
  if (seq.includes("sync") || seq.includes("coherence") || scenario.includes("SYNC")) matched.push(getRule("SYNC-001")!);
  if (scenario.includes("CACHE") || seq.includes("cache_stale")) matched.push(getRule("SYNC-002")!);
  if (scenario.includes("PAYLOAD")) matched.push(getRule("DATA-001")!);
  if (scenario.includes("CREDIT-DUPLICATE")) matched.push(getRule("CREDIT-001")!);
  if (scenario.includes("REFUND-DUPLICATE")) matched.push(getRule("CREDIT-002")!);
  if (scenario.includes("RATE")) matched.push(getRule("AUTH-001")!);
  if (scenario.includes("MIGRATION")) matched.push(getRule("SYSTEM-001")!);
  if (scenario.includes("LEDGER")) matched.push(getRule("CREDIT-001")!);

  const critSensors = input.sensors?.filter((s) => s.level === "CRIT") ?? [];
  if (critSensors.some((s) => s.sensor === "HB_CREDIT")) matched.push(getRule("CREDIT-003")!);

  return [...new Map(matched.map((r) => [r.id, r])).values()];
}

export function countActiveRules(): number {
  return HOBELISCO_RULES.filter((r) => r.state === "active").length;
}
