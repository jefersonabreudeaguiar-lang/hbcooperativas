/** Identidade persistente do organismo LAB */

import { HOBELISCO_LAB_ORGANISM_VERSION, LAB_ORGANISM_ID, loadLabOrganismConfig } from "../config";
import { getLatestDefenseDna } from "../dna/DefenseDNA";
import { nowIso } from "../lab-world/LabClock";
import type { FortressLevel, HobeliscoState, RiskLevel } from "../types";

export interface OrganismIdentity {
  organismId: string;
  version: string;
  dnaId: string;
  parentDefenseId: string | null;
  birthAt: string;
  generation: number;
  vitalState: HobeliscoState;
  health: number;
  riskLevel: RiskLevel;
  fortressLevel: FortressLevel;
  heartbeat: number;
  metabolism: string;
  memoryHealth: number;
  sensorHealth: number;
  auditHealth: number;
}

let identity: OrganismIdentity | null = null;
let pulseCount = 0;

export function initOrganismIdentity(overrides?: Partial<OrganismIdentity>): OrganismIdentity {
  const cfg = loadLabOrganismConfig();
  const dna = getLatestDefenseDna();
  identity = {
    organismId: cfg.organismId,
    version: HOBELISCO_LAB_ORGANISM_VERSION,
    dnaId: dna.version,
    parentDefenseId: null,
    birthAt: nowIso(),
    generation: 1,
    vitalState: "BIRTH",
    health: 100,
    riskLevel: "L0_OBSERVE",
    fortressLevel: "NORMAL",
    heartbeat: 0,
    metabolism: "NORMAL",
    memoryHealth: 100,
    sensorHealth: 100,
    auditHealth: 100,
    ...overrides,
  };
  pulseCount = 0;
  return identity;
}

export function getOrganismIdentity(): OrganismIdentity {
  if (!identity) return initOrganismIdentity();
  return identity;
}

export function updateOrganismIdentity(patch: Partial<OrganismIdentity>): OrganismIdentity {
  const current = getOrganismIdentity();
  identity = { ...current, ...patch };
  return identity;
}

export function incrementHeartbeat(): number {
  pulseCount += 1;
  if (identity) identity.heartbeat = pulseCount;
  return pulseCount;
}

export function getPulseCount(): number {
  return pulseCount;
}

export function resetOrganismIdentity(): void {
  identity = null;
  pulseCount = 0;
}

export const DEFAULT_ORGANISM_ID = LAB_ORGANISM_ID;
