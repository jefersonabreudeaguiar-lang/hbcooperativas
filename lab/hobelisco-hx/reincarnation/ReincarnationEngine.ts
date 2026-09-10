/** Reincarnation Engine — defesa falha → análise → nova versão */

export interface DefenseLifecycle {
  id: string;
  version: string;
  status: "alive" | "dead" | "analysis" | "arena" | "validated" | "canary" | "production";
  notes: string[];
}

export class ReincarnationEngine {
  private defenses: DefenseLifecycle[] = [];

  register(version: string): DefenseLifecycle {
    const d: DefenseLifecycle = {
      id: `def_${Date.now()}`,
      version,
      status: "alive",
      notes: ["born in lab"],
    };
    this.defenses.push(d);
    return d;
  }

  markDead(id: string, reason: string): DefenseLifecycle | undefined {
    const d = this.defenses.find((x) => x.id === id);
    if (!d) return undefined;
    d.status = "dead";
    d.notes.push(`dead: ${reason}`);
    return d;
  }

  reincarnate(id: string, newVersion: string): DefenseLifecycle | undefined {
    const dead = this.defenses.find((x) => x.id === id);
    if (!dead || dead.status !== "dead") return undefined;

    dead.status = "analysis";
    dead.notes.push("analysis complete");

    const next = this.register(newVersion);
    next.status = "arena";
    next.notes.push(`reincarnated from ${dead.version}`);
    dead.notes.push(`successor ${next.id}`);
    return next;
  }

  promote(id: string, to: DefenseLifecycle["status"]): DefenseLifecycle | undefined {
    const d = this.defenses.find((x) => x.id === id);
    if (!d) return undefined;
    d.status = to;
    d.notes.push(`promoted → ${to}`);
    return d;
  }

  list(): DefenseLifecycle[] {
    return [...this.defenses];
  }
}
