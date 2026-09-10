/** Métricas de sobrevivência de defesas na Arena */

export interface DefenseRecord {
  id: string;
  version: string;
  status: "alive" | "dead" | "analysis" | "arena" | "validated" | "canary" | "production";
  parentDefenseId?: string;
  mutationReason?: string;
  newPolicy?: string;
  expectedImprovement?: string;
  failureCause?: string;
  failureContext?: string;
  notes: string[];
  metrics: DefenseMetrics;
}

export interface DefenseMetrics {
  simulations: number;
  passed: number;
  failed: number;
  survivalRate: number;
  failureRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  containmentRate: number;
  recoveryRate: number;
}

export function emptyMetrics(): DefenseMetrics {
  return {
    simulations: 0,
    passed: 0,
    failed: 0,
    survivalRate: 0,
    failureRate: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    containmentRate: 0,
    recoveryRate: 0,
  };
}

export function computeMetrics(input: {
  simulations: number;
  passed: number;
  contained: number;
  recovered: number;
  falsePositives: number;
  falseNegatives: number;
}): DefenseMetrics {
  const failed = input.simulations - input.passed;
  return {
    simulations: input.simulations,
    passed: input.passed,
    failed,
    survivalRate: input.simulations ? Math.round((input.passed / input.simulations) * 100) : 0,
    failureRate: input.simulations ? Math.round((failed / input.simulations) * 100) : 0,
    falsePositiveRate: input.simulations ? Math.round((input.falsePositives / input.simulations) * 100) : 0,
    falseNegativeRate: input.simulations ? Math.round((input.falseNegatives / input.simulations) * 100) : 0,
    containmentRate: input.simulations ? Math.round((input.contained / input.simulations) * 100) : 0,
    recoveryRate: input.simulations ? Math.round((input.recovered / input.simulations) * 100) : 0,
  };
}

export class DefenseRegistry {
  private defenses: DefenseRecord[] = [];

  register(id: string, version: string, extra?: Partial<DefenseRecord>): DefenseRecord {
    const d: DefenseRecord = {
      id,
      version,
      status: "alive",
      notes: [],
      metrics: emptyMetrics(),
      ...extra,
    };
    this.defenses.push(d);
    return d;
  }

  get(id: string): DefenseRecord | undefined {
    return this.defenses.find((d) => d.id === id);
  }

  markFailed(id: string, cause: string, context: string): DefenseRecord | undefined {
    const d = this.get(id);
    if (!d) return undefined;
    d.status = "dead";
    d.failureCause = cause;
    d.failureContext = context;
    d.notes.push(`FAILED: ${cause}`);
    return d;
  }

  beginAnalysis(id: string): DefenseRecord | undefined {
    const d = this.get(id);
    if (!d || d.status !== "dead") return undefined;
    d.status = "analysis";
    d.notes.push("ANALYSIS started");
    return d;
  }

  spawnSuccessor(
    deadId: string,
    newId: string,
    newVersion: string,
    mutation: { reason: string; policy: string; expectedImprovement: string }
  ): DefenseRecord | undefined {
    const dead = this.get(deadId);
    if (!dead || dead.status !== "analysis") return undefined;
    const next = this.register(newId, newVersion, {
      parentDefenseId: deadId,
      mutationReason: mutation.reason,
      newPolicy: mutation.policy,
      expectedImprovement: mutation.expectedImprovement,
      status: "arena",
    });
    dead.notes.push(`successor ${newId}`);
    return next;
  }

  setMetrics(id: string, metrics: DefenseMetrics): DefenseRecord | undefined {
    const d = this.get(id);
    if (!d) return undefined;
    d.metrics = metrics;
    return d;
  }

  listDead(): DefenseRecord[] {
    return this.defenses.filter((d) => d.status === "dead" || d.status === "analysis");
  }

  listAll(): DefenseRecord[] {
    return [...this.defenses];
  }

  explainDnaVersion(version: string): string | null {
    const d = this.defenses.find((x) => x.version === version);
    if (!d) return null;
    return [
      `Versão ${version}`,
      d.parentDefenseId ? `parent: ${d.parentDefenseId}` : "parent: none",
      d.mutationReason ? `mutation: ${d.mutationReason}` : "",
      d.expectedImprovement ? `expected: ${d.expectedImprovement}` : "",
      `survival: ${d.metrics.survivalRate}%`,
    ]
      .filter(Boolean)
      .join("; ");
  }
}
