/** Anticorpos digitais — ligados a regras AUTHZ/SYNC/AUTH */

import type { DefenseAntibody, ThreatFingerprint } from "../types";

const REGISTRY: DefenseAntibody[] = [
  {
    id: "ANTIBODY-IDOR-001",
    name: "Bloqueio IDOR cooperativa",
    bornFrom: "incident:cross-cnpj-probe",
    ruleId: "AUTHZ-001",
    version: "1.0.0",
    reusable: true,
  },
  {
    id: "ANTIBODY-SYNC-001",
    name: "Push incoerente ficha",
    bornFrom: "incident:thin-snapshot-push",
    ruleId: "SYNC-001",
    version: "1.0.0",
    reusable: true,
  },
  {
    id: "ANTIBODY-AUTH-001",
    name: "Bruteforce login",
    bornFrom: "incident:auth-rate-spike",
    ruleId: "AUTH-001",
    version: "1.0.0",
    reusable: true,
  },
  {
    id: "ANTIBODY-ASSINATURA-001",
    name: "FSM assinatura bypass",
    bornFrom: "incident:legacy-signature-push",
    ruleId: "SYNC-003",
    version: "1.0.0",
    reusable: true,
  },
  {
    id: "ANTIBODY-CREDIT-001",
    name: "Duplicidade liquidação",
    bornFrom: "incident:settlement-duplicate",
    ruleId: "CREDIT-001",
    version: "1.0.0",
    reusable: true,
  },
];

export function listAntibodies(): DefenseAntibody[] {
  return [...REGISTRY];
}

export function matchAntibodyForThreat(threat: ThreatFingerprint): DefenseAntibody | undefined {
  const seq = threat.sequence.join(" ");
  if (seq.includes("idor") || seq.includes("cross_coop")) {
    return REGISTRY.find((a) => a.id === "ANTIBODY-IDOR-001");
  }
  if (seq.includes("sync") || seq.includes("coherence")) {
    return REGISTRY.find((a) => a.id === "ANTIBODY-SYNC-001");
  }
  if (seq.includes("login_fail") || seq.includes("rate_spike")) {
    return REGISTRY.find((a) => a.id === "ANTIBODY-AUTH-001");
  }
  if (seq.includes("settlement_duplicate") || seq.includes("alter_ledger")) {
    return REGISTRY.find((a) => a.id === "ANTIBODY-CREDIT-001");
  }
  return undefined;
}

export function registerAntibody(fromIncident: string, name: string, ruleId?: string): DefenseAntibody {
  const ab: DefenseAntibody = {
    id: `ANTIBODY-${Date.now()}`,
    name,
    bornFrom: fromIncident,
    ruleId,
    version: "0.1.0",
    reusable: true,
  };
  REGISTRY.push(ab);
  return ab;
}
