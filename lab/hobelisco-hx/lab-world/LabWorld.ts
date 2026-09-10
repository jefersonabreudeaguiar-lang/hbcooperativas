/** Mundo fictício LAB — cooperativas, usuários, mercados, operações */

import { LabEventBus } from "./LabEventBus";
import { nowIso } from "./LabClock";
import type { LabCooperative, LabCooperado, LabEvent, LabMarket, LabUser } from "./types";

export const COOP_LAB_A = "Coop-LAB-A";
export const COOP_LAB_B = "Coop-LAB-B";
export const COOP_LAB_C = "Coop-LAB-C";
export const MARKET_LAB_001 = "Market-LAB-001";

const COOPERATIVES: LabCooperative[] = [
  { id: COOP_LAB_A, name: "Cooperativa LAB A", cnpj: "62351750000165", users: ["User-LAB-001", "User-LAB-002"] },
  { id: COOP_LAB_B, name: "Cooperativa LAB B", cnpj: "11111111000111", users: ["User-LAB-003"] },
  { id: COOP_LAB_C, name: "Cooperativa LAB C", cnpj: "22222222000122", users: ["User-LAB-004", "User-LAB-005"] },
];

const USERS: LabUser[] = [
  { id: "User-LAB-001", name: "Operador LAB 001", cooperativeId: COOP_LAB_A, role: "admin" },
  { id: "User-LAB-002", name: "Cooperado LAB 002", cooperativeId: COOP_LAB_A, role: "cooperado" },
  { id: "User-LAB-003", name: "Operador LAB 003", cooperativeId: COOP_LAB_B, role: "admin" },
  { id: "User-LAB-004", name: "Operador LAB 004", cooperativeId: COOP_LAB_C, role: "admin" },
  { id: "User-LAB-005", name: "Cooperado LAB 005", cooperativeId: COOP_LAB_C, role: "cooperado" },
];

const COOPERADOS: LabCooperado[] = [
  { id: "Cooperado-LAB-001", name: "Cooperado Fictício 001", cooperativeId: COOP_LAB_A },
  { id: "Cooperado-LAB-002", name: "Cooperado Fictício 002", cooperativeId: COOP_LAB_A },
  { id: "Cooperado-LAB-003", name: "Cooperado Fictício 003", cooperativeId: COOP_LAB_B },
];

const MARKETS: LabMarket[] = [
  { id: MARKET_LAB_001, name: "Mercado Fictício LAB", cooperativeIds: [COOP_LAB_A, COOP_LAB_B] },
];

export interface LabOperation {
  id: string;
  kind: "purchase" | "credit_request" | "refund_request" | "settlement_request" | "delivery" | "contract";
  cooperativeId: string;
  actorId: string;
  amount: number;
  at: string;
  simulated: true;
}

export class LabWorld {
  readonly eventBus = new LabEventBus();
  readonly cooperatives = COOPERATIVES;
  readonly users = USERS;
  readonly cooperados = COOPERADOS;
  readonly markets = MARKETS;
  private operations: LabOperation[] = [];
  private opSeq = 0;

  emit(type: LabEvent["type"], cooperativeId: string, actorId: string, metadata: LabEvent["metadata"] = {}): LabEvent {
    return this.eventBus.publish({
      type,
      source: "LabWorld",
      cooperativeId,
      actorId,
      metadata,
    });
  }

  simulateOperation(
    kind: LabOperation["kind"],
    cooperativeId: string,
    actorId: string,
    amount = 100
  ): LabOperation {
    const op: LabOperation = {
      id: `OP-LAB-${++this.opSeq}`,
      kind,
      cooperativeId,
      actorId,
      amount,
      at: nowIso(),
      simulated: true,
    };
    this.operations.push(op);
    return op;
  }

  operationsForCooperative(cooperativeId: string): LabOperation[] {
    return this.operations.filter((o) => o.cooperativeId === cooperativeId);
  }

  reset(): void {
    this.operations = [];
    this.opSeq = 0;
    this.eventBus.clear();
  }
}

let worldInstance: LabWorld | null = null;

export function getLabWorld(): LabWorld {
  if (!worldInstance) worldInstance = new LabWorld();
  return worldInstance;
}

export function resetLabWorld(): LabWorld {
  worldInstance = new LabWorld();
  return worldInstance;
}
