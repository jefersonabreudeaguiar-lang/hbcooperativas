/** Snapshot/restore completo do estado LAB com integridade */

import { createHash } from "crypto";
import type { HobeliscoLabOrganism } from "../organism/HobeliscoLabOrganism";
import { getOrganismIdentity } from "../organism/OrganismIdentity";
import { getLabClockState, nowIso } from "../lab-world/LabClock";
import { listAntibodyRecords } from "../antibodies/AntibodyEngine";
import type { HobeliscoState } from "../types";

export interface FullLabSnapshot {
  id: string;
  at: string;
  integrityHash: string;
  vitalState: HobeliscoState;
  health: number;
  risk: string;
  activeDefense: string;
  dna: string;
  memory: { short: number; mid: number; long: number; recent: string[] };
  threatContext: string[];
  antibodies: number;
  auditSequence: number;
  clock: ReturnType<typeof getLabClockState>;
  worldState: { cooperatives: number; events: number; operations: number };
  core: ReturnType<HobeliscoLabOrganism["core"]["snapshot"]>;
  identity: ReturnType<typeof getOrganismIdentity>;
}

const snapshots = new Map<string, FullLabSnapshot>();

function computeIntegrity(data: Omit<FullLabSnapshot, "integrityHash">): string {
  const payload = JSON.stringify({
    state: data.vitalState,
    health: data.health,
    dna: data.dna,
    audit: data.auditSequence,
    memory: data.memory,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function createFullSnapshot(organism: HobeliscoLabOrganism): FullLabSnapshot {
  const snap = organism.core.snapshot();
  const id = `SNAP-${Date.now()}`;
  const partial = {
    id,
    at: nowIso(),
    vitalState: organism.core.stateMachine.current,
    health: snap.health.overall,
    risk: snap.riskLevel,
    activeDefense: snap.defenseDnaVersion,
    dna: getOrganismIdentity().dnaId,
    memory: {
      short: snap.memoryStats.short,
      mid: snap.memoryStats.mid,
      long: snap.memoryStats.long,
      recent: snap.recentMemory.slice(0, 5).map((m) => m.summary),
    },
    threatContext: snap.recentThreats.map((t) => t.fingerprint),
    antibodies: listAntibodyRecords().length,
    auditSequence: organism.core.audit.length,
    clock: getLabClockState(),
    worldState: {
      cooperatives: organism.world.cooperatives.length,
      events: organism.world.eventBus.all().length,
      operations: organism.world.operationsForCooperative("Coop-LAB-A").length,
    },
    core: snap,
    identity: { ...getOrganismIdentity() },
  };
  const integrityHash = computeIntegrity(partial as Omit<FullLabSnapshot, "integrityHash">);
  const data: FullLabSnapshot = { ...partial, integrityHash };
  snapshots.set(id, data);
  organism.core.audit.append("LAB_SNAPSHOT", { id, integrityHash });
  return data;
}

export function restoreFullSnapshot(organism: HobeliscoLabOrganism, data: FullLabSnapshot): boolean {
  if (!verifySnapshotIntegrity(data)) {
    organism.core.audit.append("SNAPSHOT_INTEGRITY_FAIL", { id: data.id });
    return false;
  }
  organism.core.stateMachine.force(data.vitalState);
  organism.core.audit.append("LAB_RESTORE", { snapshotId: data.id, state: data.vitalState });
  return true;
}

/** @deprecated use createFullSnapshot */
export function snapshot(organism: HobeliscoLabOrganism): FullLabSnapshot {
  return createFullSnapshot(organism);
}

/** @deprecated use restoreFullSnapshot */
export function restore(organism: HobeliscoLabOrganism, snapshotId: string): boolean {
  const data = snapshots.get(snapshotId);
  if (!data) return false;
  return restoreFullSnapshot(organism, data);
}

export function getSnapshot(id: string): FullLabSnapshot | undefined {
  return snapshots.get(id);
}

export function listSnapshots(): string[] {
  return [...snapshots.keys()];
}

export function clearSnapshots(): void {
  snapshots.clear();
}

export function verifySnapshotIntegrity(data: FullLabSnapshot): boolean {
  const { integrityHash, ...rest } = data;
  return computeIntegrity(rest) === integrityHash;
}
