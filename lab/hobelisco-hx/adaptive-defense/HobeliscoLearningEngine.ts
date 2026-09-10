import type { DefenseLearningCandidate } from "./types";

export class HobeliscoLearningEngine {
  private candidates: DefenseLearningCandidate[] = [];

  propose(candidate: DefenseLearningCandidate): DefenseLearningCandidate {
    const entry = { ...candidate, status: "PROPOSED" as const };
    this.candidates.push(entry);
    return entry;
  }

  transition(id: string, status: DefenseLearningCandidate["status"]): DefenseLearningCandidate | null {
    const idx = this.candidates.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    if (status === "DEPLOYED" && this.candidates[idx].status !== "APPROVED") {
      return null;
    }
    this.candidates[idx] = { ...this.candidates[idx], status };
    return this.candidates[idx];
  }

  list(status?: DefenseLearningCandidate["status"]): DefenseLearningCandidate[] {
    return status ? this.candidates.filter((c) => c.status === status) : [...this.candidates];
  }

  reset(): void {
    this.candidates = [];
  }
}

let shared: HobeliscoLearningEngine | null = null;

export function getLearningEngine(): HobeliscoLearningEngine {
  if (!shared) shared = new HobeliscoLearningEngine();
  return shared;
}
