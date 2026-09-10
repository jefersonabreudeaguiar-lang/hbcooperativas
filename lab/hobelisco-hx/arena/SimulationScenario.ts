/** Cenários oficiais V1 — SIM-* */

import type { ArenaScenario } from "../types";

export const ARENA_SCENARIOS: ArenaScenario[] = [
  {
    id: "SIM-AUTH-001",
    title: "Bruteforce autenticação",
    description: "Múltiplas falhas de login",
    ruleIds: ["AUTH-001"],
    injectThreat: { sequence: ["login_fail", "login_fail", "login_fail", "login_fail"] },
    sensorContext: { authFailures: 15 },
  },
  {
    id: "SIM-IDOR-001",
    title: "IDOR cross-cooperativa",
    description: "Sonda CNPJ alheio em API crédito",
    ruleIds: ["AUTHZ-001"],
    injectThreat: {
      sequence: ["cross_coop_probe", "idor"],
      endpoint: "/api/credit/dashboard",
      cooperativeCnpj: "00000000000000",
      userRole: "parceiro",
    },
  },
  {
    id: "SIM-SYNC-001",
    title: "Push sync incoerente",
    description: "Snapshot operacional fino demais",
    ruleIds: ["SYNC-001", "SYNC-002"],
    injectThreat: { sequence: ["sync_push", "coherence_fail"] },
    sensorContext: { syncBlocked: true },
    autoRepairAction: "RESTART_SYNC_QUEUE",
  },
  {
    id: "SIM-CACHE-001",
    title: "Cache stale",
    description: "Estado local desatualizado — reparo CLEAR_CACHE",
    ruleIds: ["SYNC-002"],
    injectThreat: { sequence: ["cache_stale", "sync_local"] },
    autoRepairAction: "CLEAR_CACHE",
  },
  {
    id: "SIM-CREDIT-DUPLICATE-001",
    title: "Liquidação duplicada",
    description: "Idempotency settlement",
    ruleIds: ["CREDIT-001"],
    injectThreat: { sequence: ["settlement_duplicate", "idempotency_violation"] },
    sensorContext: { creditAnomaly: true },
  },
  {
    id: "SIM-REFUND-DUPLICATE-001",
    title: "Estorno duplicado",
    description: "REFUND_SINGLE_EXECUTION",
    ruleIds: ["CREDIT-002"],
    injectThreat: { sequence: ["refund_duplicate"] },
  },
  {
    id: "SIM-PAYLOAD-LARGE-001",
    title: "Payload oversized",
    description: "Rejeição DATA-001",
    ruleIds: ["DATA-001"],
    injectThreat: { sequence: ["payload_large", "reject"] },
  },
  {
    id: "SIM-RATE-001",
    title: "Rate limit API",
    description: "Spike de requisições",
    ruleIds: ["AUTH-001"],
    injectThreat: { sequence: ["rate_spike", "api_429"] },
    sensorContext: { authFailures: 8 },
  },
  {
    id: "SIM-MIGRATION-DRIFT-001",
    title: "Migration drift",
    description: "Schema divergente — humano obrigatório",
    ruleIds: ["SYSTEM-001"],
    injectThreat: { sequence: ["migration_drift", "schema_mismatch"] },
  },
  {
    id: "SIM-LEDGER-INTEGRITY-001",
    title: "Integridade ledger",
    description: "Tentativa ALTER_LEDGER bloqueada",
    ruleIds: ["CREDIT-001"],
    simulateFinancialAttack: { action: "ALTER_LEDGER", target: "hb_credit_transactions" },
    injectThreat: { sequence: ["alter_ledger"] },
  },
];
