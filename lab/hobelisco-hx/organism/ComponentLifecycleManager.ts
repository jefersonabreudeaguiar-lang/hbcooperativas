/** Gerenciamento de ciclo de vida de componentes seguros no LAB */

import { CircuitBreaker } from "../validation/CircuitBreaker";
import type { HobeliscoCore } from "../core/HobeliscoCore";

export type SafeComponent = "sensor" | "memory" | "eventBus" | "observer";

export interface ComponentStatus {
  id: SafeComponent;
  running: boolean;
  health: "OK" | "DEGRADED" | "DEAD";
  restarts: number;
}

export class ComponentLifecycleManager {
  private statuses: Map<SafeComponent, ComponentStatus> = new Map();
  private breaker = new CircuitBreaker();

  constructor() {
    for (const id of ["sensor", "memory", "eventBus", "observer"] as SafeComponent[]) {
      this.statuses.set(id, { id, running: true, health: "OK", restarts: 0 });
    }
  }

  stopComponent(id: SafeComponent): ComponentStatus {
    const s = this.statuses.get(id)!;
    s.running = false;
    s.health = "DEAD";
    return s;
  }

  startComponent(id: SafeComponent): ComponentStatus {
    const s = this.statuses.get(id)!;
    s.running = true;
    s.health = "OK";
    return s;
  }

  restartComponent(id: SafeComponent): ComponentStatus | { blocked: true; reason: string } {
    if (!this.breaker.canAttemptRepair()) {
      return { blocked: true, reason: "CIRCUIT_OPEN" };
    }
    const s = this.statuses.get(id)!;
    s.running = false;
    s.running = true;
    s.restarts += 1;
    s.health = "OK";
    this.breaker.recordSuccess();
    return s;
  }

  markDegraded(id: SafeComponent): ComponentStatus {
    const s = this.statuses.get(id)!;
    s.health = "DEGRADED";
    return s;
  }

  recordFailure(reason: string): void {
    this.breaker.recordFailure(reason);
    const open = this.breaker.snapshot().open;
    if (open) {
      for (const s of this.statuses.values()) {
        if (!s.running) s.health = "DEAD";
      }
    }
  }

  all(): ComponentStatus[] {
    return [...this.statuses.values()];
  }

  hasCriticalDead(): boolean {
    return this.all().some((s) => s.health === "DEAD" && (s.id === "memory" || s.id === "observer"));
  }

  applyToCore(core: HobeliscoCore): { degraded: string[]; dead: string[] } {
    const degraded: string[] = [];
    const dead: string[] = [];
    for (const s of this.all()) {
      if (s.health === "DEAD") dead.push(s.id);
      if (s.health === "DEGRADED") degraded.push(s.id);
    }
    if (dead.includes("memory")) {
      core.audit.append("COMPONENT_DEAD", { component: "memory" });
    }
    return { degraded, dead };
  }
}
