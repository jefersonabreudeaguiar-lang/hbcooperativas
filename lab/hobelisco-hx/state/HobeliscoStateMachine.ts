/** Máquina de estados — ciclo vital V1 */

import type { HobeliscoState } from "../types";

const TRANSITIONS: Record<HobeliscoState, HobeliscoState[]> = {
  BIRTH: ["BOOT"],
  BOOT: ["AWAKE", "DEAD", "SAFE_MODE"],
  AWAKE: ["WATCHING", "HIBERNATING", "SAFE_MODE"],
  WATCHING: ["LEARNING", "DEFENDING", "FORTRESS", "HIBERNATING"],
  LEARNING: ["AWAKE", "WATCHING"],
  DEFENDING: ["RECOVERING", "FORTRESS", "FAILED", "DEAD"],
  RECOVERING: ["LEARNING", "WATCHING", "SAFE_MODE", "DEAD"],
  FORTRESS: ["WATCHING", "DEFENDING", "RECOVERING", "SAFE_MODE"],
  HIBERNATING: ["AWAKE"],
  SAFE_MODE: ["WATCHING", "REINCARNATING", "BOOT"],
  FAILED: ["DEAD", "RECOVERING"],
  DEAD: ["ANALYSIS", "REINCARNATING"],
  ANALYSIS: ["REINCARNATING"],
  REINCARNATING: ["BIRTH", "BOOT"],
};

export class HobeliscoStateMachine {
  private state: HobeliscoState = "BIRTH";

  get current(): HobeliscoState {
    return this.state;
  }

  canTransition(to: HobeliscoState): boolean {
    return TRANSITIONS[this.state]?.includes(to) ?? false;
  }

  transition(to: HobeliscoState): HobeliscoState {
    if (!this.canTransition(to)) {
      throw new Error(`Transição inválida: ${this.state} → ${to}`);
    }
    this.state = to;
    return this.state;
  }

  force(to: HobeliscoState): HobeliscoState {
    this.state = to;
    return this.state;
  }

  bootSequence(): HobeliscoState[] {
    const path: HobeliscoState[] = [];
    if (this.state === "BIRTH") path.push(this.transition("BOOT"));
    if (this.state === "BOOT") path.push(this.transition("AWAKE"));
    if (this.state === "AWAKE") path.push(this.transition("WATCHING"));
    return path;
  }

  /** Fluxo pós-defesa: RECOVERING → LEARNING → AWAKE */
  recoveryLearningCycle(): HobeliscoState[] {
    const path: HobeliscoState[] = [];
    if (this.state === "DEFENDING") {
      try {
        path.push(this.transition("RECOVERING"));
      } catch {
        this.force("RECOVERING");
        path.push("RECOVERING");
      }
    }
    if (this.state === "RECOVERING") {
      try {
        path.push(this.transition("LEARNING"));
      } catch {
        /* skip */
      }
    }
    if (this.state === "LEARNING") {
      try {
        path.push(this.transition("AWAKE"));
        path.push(this.transition("WATCHING"));
      } catch {
        this.force("WATCHING");
        path.push("WATCHING");
      }
    }
    return path;
  }
}
