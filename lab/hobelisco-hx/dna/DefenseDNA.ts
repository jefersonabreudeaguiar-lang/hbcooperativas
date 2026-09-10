/** Defense DNA versionado — políticas e thresholds, não IA */

export interface DefenseDnaRecord {
  version: string;
  thresholds: {
    healthWarn: number;
    healthCrit: number;
    fortressElevated: number;
    fortressDefensive: number;
    fortressFull: number;
  };
  allowedResponses: string[];
  patterns: string[];
}

const DNA_0001: DefenseDnaRecord = {
  version: "DNA-0001",
  thresholds: {
    healthWarn: 75,
    healthCrit: 50,
    fortressElevated: 70,
    fortressDefensive: 55,
    fortressFull: 40,
  },
  allowedResponses: [
    "OBSERVE",
    "LOG",
    "ALERT",
    "CONTAIN_RATE",
    "FORTRESS_ELEVATE",
    "FREEZE_FINANCIAL",
    "HUMAN_REQUIRED",
  ],
  patterns: ["idor-sequence", "sync-incoherence", "auth-bruteforce", "credit-anomaly"],
};

const DNA_0002: DefenseDnaRecord = {
  ...DNA_0001,
  version: "DNA-0002",
  patterns: [...DNA_0001.patterns, "assinatura-fsm-bypass", "partner-pix-drift"],
};

const REGISTRY: DefenseDnaRecord[] = [DNA_0001, DNA_0002];

export function getLatestDefenseDna(): DefenseDnaRecord {
  return REGISTRY[REGISTRY.length - 1];
}

export function getDefenseDna(version: string): DefenseDnaRecord | undefined {
  return REGISTRY.find((d) => d.version === version);
}

export function listDefenseDnaVersions(): string[] {
  return REGISTRY.map((d) => d.version);
}
