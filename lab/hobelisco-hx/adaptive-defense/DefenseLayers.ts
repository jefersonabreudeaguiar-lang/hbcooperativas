/** L1–L10 defense-in-depth model */

export type DefenseLayerId =
  | "L1_INPUT"
  | "L2_AUTH"
  | "L3_AUTHORIZATION"
  | "L4_RATE_LIMIT"
  | "L5_REPLAY"
  | "L6_INTEGRITY"
  | "L7_CORRELATION"
  | "L8_ACTIVE_DEFENSE"
  | "L9_AUDIT"
  | "L10_INCIDENT_RESPONSE";

export interface DefenseLayer {
  id: DefenseLayerId;
  name: string;
  actions: string[];
  families: string[];
}

export const DEFENSE_LAYERS: DefenseLayer[] = [
  { id: "L1_INPUT", name: "Input Validation", actions: ["PAYLOAD_REJECTION", "schema_check"], families: ["T03_INJECTION", "T04_WEB_API"] },
  { id: "L2_AUTH", name: "Authentication", actions: ["REJECT", "BACKOFF"], families: ["T01_AUTH", "T06_SESSION"] },
  { id: "L3_AUTHORIZATION", name: "Authorization", actions: ["REJECT"], families: ["T02_AUTHZ", "T13_ADMIN"] },
  { id: "L4_RATE_LIMIT", name: "Rate Limiting", actions: ["RATE_LIMIT", "TEMPORARY_BLOCK"], families: ["T07_RATE", "T01_AUTH"] },
  { id: "L5_REPLAY", name: "Replay Protection", actions: ["REPLAY_REJECTION"], families: ["T05_CRYPTO", "T11_SYNC"] },
  { id: "L6_INTEGRITY", name: "Integrity", actions: ["PAYLOAD_REJECTION", "REJECT"], families: ["T05_CRYPTO", "T10_INTEGRITY"] },
  { id: "L7_CORRELATION", name: "Correlation", actions: ["alert", "escalate"], families: ["T14_INSIDER", "T12_HB_CREDIT"] },
  { id: "L8_ACTIVE_DEFENSE", name: "Active Defense", actions: ["REJECT", "QUARANTINE", "SESSION_INVALIDATION"], families: ["T01_AUTH", "T02_AUTHZ", "T12_HB_CREDIT"] },
  { id: "L9_AUDIT", name: "Audit", actions: ["log", "chain"], families: ["*"] },
  { id: "L10_INCIDENT_RESPONSE", name: "Incident Response", actions: ["human_approval", "playbook"], families: ["*"] },
];

export function layersForFamily(family: string): DefenseLayer[] {
  return DEFENSE_LAYERS.filter((l) => l.families.includes("*") || l.families.includes(family));
}
