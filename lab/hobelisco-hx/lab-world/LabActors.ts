/** Atores fictícios do LAB */

export type LabActorRole =
  | "cooperado"
  | "responsavel"
  | "admin"
  | "mercado"
  | "atacante"
  | "sistema";

export interface LabActor {
  id: string;
  name: string;
  role: LabActorRole;
  cooperativeId: string;
  legitimate: boolean;
}

export const LAB_ACTORS: LabActor[] = [
  { id: "Actor-LAB-Cooperado-001", name: "Cooperado Legítimo", role: "cooperado", cooperativeId: "Coop-LAB-A", legitimate: true },
  { id: "Actor-LAB-Responsavel-001", name: "Responsável Legítimo", role: "responsavel", cooperativeId: "Coop-LAB-A", legitimate: true },
  { id: "Actor-LAB-Admin-001", name: "Admin LAB A", role: "admin", cooperativeId: "Coop-LAB-A", legitimate: true },
  { id: "Actor-LAB-Market-001", name: "Mercado Operador", role: "mercado", cooperativeId: "Coop-LAB-A", legitimate: true },
  { id: "Actor-LAB-Cooperado-B", name: "Cooperado Coop B", role: "cooperado", cooperativeId: "Coop-LAB-B", legitimate: true },
  { id: "Actor-LAB-Attacker-001", name: "Atacante Simulado", role: "atacante", cooperativeId: "Coop-LAB-A", legitimate: false },
  { id: "Actor-LAB-System", name: "Sistema LAB", role: "sistema", cooperativeId: "Coop-LAB-A", legitimate: true },
];

export function getActor(id: string): LabActor | undefined {
  return LAB_ACTORS.find((a) => a.id === id);
}

export function actorsForCooperative(cooperativeId: string): LabActor[] {
  return LAB_ACTORS.filter((a) => a.cooperativeId === cooperativeId);
}

export function attackerActors(): LabActor[] {
  return LAB_ACTORS.filter((a) => !a.legitimate);
}
