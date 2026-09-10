/** Proteção contra loops de remediação/detecção */

export class LoopGuard {
  private counts = new Map<string, number>();
  readonly maxPerKey: number;

  constructor(maxPerKey = 5) {
    this.maxPerKey = maxPerKey;
  }

  tick(key: string): { allowed: boolean; count: number } {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { allowed: count <= this.maxPerKey, count };
  }

  reset(key?: string): void {
    if (key) this.counts.delete(key);
    else this.counts.clear();
  }
}
