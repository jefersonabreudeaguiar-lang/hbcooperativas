import type { AttackChainStage, ThreatFamilyId, ThreatKnowledgeEntry } from "./types";

export const THREAT_KNOWLEDGE_VERSION = "TKB-1.0.0-LAB";

const NOW = "2026-09-09T00:00:00.000Z";

/** Base normalizada — fontes conceituais MITRE/OWASP/CWE (sem cópia indiscriminada) */
export const THREAT_KNOWLEDGE_BASE: ThreatKnowledgeEntry[] = [
  { id: "TKB-T01-001", family: "T01_AUTH", technique: "brute_force", category: "Authentication", indicators: ["auth_failure_burst"], detection: "rate+failure correlation", mitigation: "rate_limit+backoff", severity: "HIGH", source: "MITRE ATT&CK T1110", sourceVersion: "14.1", retrievedAt: NOW },
  { id: "TKB-T01-002", family: "T01_AUTH", technique: "credential_stuffing", category: "Authentication", indicators: ["distributed_auth_failure"], detection: "cross-source auth pattern", mitigation: "temporary_block", severity: "HIGH", source: "OWASP ASVS", sourceVersion: "4.0", retrievedAt: NOW },
  { id: "TKB-T02-001", family: "T02_AUTHZ", technique: "idor", category: "Authorization", indicators: ["cross_tenant_access"], detection: "scope mismatch", mitigation: "reject", severity: "CRITICAL", source: "OWASP API Top 10", sourceVersion: "2023", retrievedAt: NOW },
  { id: "TKB-T02-002", family: "T02_AUTHZ", technique: "privilege_escalation", category: "Authorization", indicators: ["role_mismatch"], detection: "role vs endpoint", mitigation: "reject", severity: "CRITICAL", source: "CWE-269", sourceVersion: "4.14", retrievedAt: NOW },
  { id: "TKB-T03-001", family: "T03_INJECTION", technique: "sql_injection", category: "Injection", indicators: ["sql_pattern"], detection: "payload validation", mitigation: "payload_rejection", severity: "CRITICAL", source: "CWE-89", sourceVersion: "4.14", retrievedAt: NOW },
  { id: "TKB-T04-001", family: "T04_WEB_API", technique: "ssrf", category: "Web/API", indicators: ["internal_url_probe"], detection: "url allowlist", mitigation: "reject", severity: "HIGH", source: "OWASP Top 10", sourceVersion: "2021", retrievedAt: NOW },
  { id: "TKB-T05-001", family: "T05_CRYPTO", technique: "replay", category: "Integrity", indicators: ["nonce_reuse"], detection: "nonce+timestamp", mitigation: "replay_rejection", severity: "CRITICAL", source: "CWE-294", sourceVersion: "4.14", retrievedAt: NOW },
  { id: "TKB-T06-001", family: "T06_SESSION", technique: "session_replay", category: "Session", indicators: ["token_reuse"], detection: "session fingerprint", mitigation: "session_invalidation", severity: "HIGH", source: "OWASP Session", sourceVersion: "4.0", retrievedAt: NOW },
  { id: "TKB-T07-001", family: "T07_RATE", technique: "request_flooding", category: "Rate Abuse", indicators: ["rate_spike"], detection: "rate limiter", mitigation: "rate_limit", severity: "MEDIUM", source: "Verizon DBIR pattern", sourceVersion: "2024", retrievedAt: NOW },
  { id: "TKB-T11-001", family: "T11_SYNC", technique: "sync_replay", category: "Sync", indicators: ["duplicate_sync"], detection: "sync fingerprint", mitigation: "replay_rejection", severity: "HIGH", source: "internal_lab", sourceVersion: "1.0", retrievedAt: NOW },
  { id: "TKB-T12-001", family: "T12_HB_CREDIT", technique: "integrity_divergence", category: "HB Credit", indicators: ["available!=limit-used"], detection: "read-only probe", mitigation: "alert+human", severity: "MEDIUM", source: "internal_lab", sourceVersion: "1.0", retrievedAt: NOW },
  { id: "TKB-T12-002", family: "T12_HB_CREDIT", technique: "cross_coop_access", category: "HB Credit", indicators: ["cross_cooperative_id"], detection: "tenant isolation", mitigation: "reject", severity: "CRITICAL", source: "internal_lab", sourceVersion: "1.0", retrievedAt: NOW },
  { id: "TKB-T13-001", family: "T13_ADMIN", technique: "admin_burst", category: "Admin", indicators: ["admin_endpoint_abuse"], detection: "admin rate+auth", mitigation: "temporary_block", severity: "HIGH", source: "internal_lab", sourceVersion: "1.0", retrievedAt: NOW },
  { id: "TKB-T14-001", family: "T14_INSIDER", technique: "unusual_access", category: "Insider Signal", indicators: ["anomaly_sequence"], detection: "behavior correlation", mitigation: "alert", severity: "MEDIUM", source: "internal_lab", sourceVersion: "1.0", retrievedAt: NOW },
];

export function getThreatKnowledge(family?: ThreatFamilyId): ThreatKnowledgeEntry[] {
  if (!family) return THREAT_KNOWLEDGE_BASE;
  return THREAT_KNOWLEDGE_BASE.filter((e) => e.family === family);
}

export function mapSequenceToChainStage(sequence: string[]): AttackChainStage {
  if (sequence.some((s) => s.includes("recon"))) return "RECON";
  if (sequence.some((s) => s.includes("login") || s.includes("auth"))) return "AUTHENTICATION";
  if (sequence.some((s) => s.includes("idor") || s.includes("privilege"))) return "AUTHORIZATION";
  if (sequence.some((s) => s.includes("alter") || s.includes("ledger"))) return "DATA_MANIPULATION";
  if (sequence.some((s) => s.includes("sync"))) return "EXECUTION";
  return "INITIAL_ACCESS";
}

export function getKnowledgeVersion(): string {
  return THREAT_KNOWLEDGE_VERSION;
}
