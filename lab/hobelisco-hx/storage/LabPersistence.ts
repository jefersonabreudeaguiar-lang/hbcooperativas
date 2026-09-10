/**
 * Persistência lab — espelha tabelas hb_hobelisco_* em memória.
 * Não conecta ao Supabase prod. Migration de referência em schema/hb_hobelisco_lab.sql
 */

import type { AuditChainEvent, ThreatFingerprint } from "../types";
import type { HobeliscoRule } from "../types";

export interface LabIncident {
  id: string;
  kind: string;
  severity: string;
  status: "open" | "contained" | "resolved";
  at: string;
}

export class LabPersistence {
  events: AuditChainEvent[] = [];
  incidents: LabIncident[] = [];
  rules: HobeliscoRule[] = [];
  healthSnapshots: Array<{ at: string; score: number }> = [];
  threatMemory: ThreatFingerprint[] = [];
  simulations: Array<{ id: string; scenarioId: string; passed: boolean; at: string }> = [];
  dnaVersions: string[] = ["DNA-0001", "DNA-0002"];

  recordEvent(event: AuditChainEvent): void {
    this.events.push(event);
  }

  recordIncident(incident: Omit<LabIncident, "id" | "at">): LabIncident {
    const row: LabIncident = {
      id: `inc_${Date.now()}`,
      at: new Date().toISOString(),
      ...incident,
    };
    this.incidents.push(row);
    return row;
  }

  recordThreat(threat: ThreatFingerprint): void {
    this.threatMemory.unshift(threat);
    if (this.threatMemory.length > 100) this.threatMemory.pop();
  }

  recordSimulation(scenarioId: string, passed: boolean): void {
    this.simulations.push({
      id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      scenarioId,
      passed,
      at: new Date().toISOString(),
    });
  }

  stats(): Record<string, number> {
    return {
      events: this.events.length,
      incidents: this.incidents.length,
      rules: this.rules.length,
      healthSnapshots: this.healthSnapshots.length,
      threatMemory: this.threatMemory.length,
      simulations: this.simulations.length,
      dna: this.dnaVersions.length,
    };
  }
}

let store: LabPersistence | null = null;

export function getLabPersistence(): LabPersistence {
  if (!store) store = new LabPersistence();
  return store;
}

export function resetLabPersistence(): LabPersistence {
  store = new LabPersistence();
  return store;
}
