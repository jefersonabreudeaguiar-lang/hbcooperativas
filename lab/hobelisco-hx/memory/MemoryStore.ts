/** Memória enriquecida — origem, contexto, resultado, defesa, eficácia */

import type { MemoryEvent } from "../types";

const SHORT_LIMIT = 50;
const MID_LIMIT = 200;
const LONG_LIMIT = 500;

export interface RememberInput {
  layer: MemoryEvent["layer"];
  kind: string;
  summary: string;
  origin?: string;
  context?: string;
  result?: string;
  defenseUsed?: string | null;
  efficacy?: number | null;
}

export class MemoryStore {
  private short: MemoryEvent[] = [];
  private mid: MemoryEvent[] = [];
  private long: MemoryEvent[] = [];

  remember(input: RememberInput): MemoryEvent {
    const event: MemoryEvent = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      layer: input.layer,
      kind: input.kind,
      summary: input.summary,
      origin: input.origin ?? "core",
      context: input.context ?? "lab",
      result: input.result ?? "recorded",
      defenseUsed: input.defenseUsed ?? null,
      efficacy: input.efficacy ?? null,
      at: new Date().toISOString(),
    };

    if (input.layer === "short") {
      this.short.unshift(event);
      if (this.short.length > SHORT_LIMIT) {
        const overflow = this.short.pop();
        if (overflow) this.mid.unshift({ ...overflow, layer: "mid" });
      }
    } else if (input.layer === "mid") {
      this.mid.unshift(event);
      if (this.mid.length > MID_LIMIT) {
        const overflow = this.mid.pop();
        if (overflow) this.long.unshift({ ...overflow, layer: "long" });
      }
    } else {
      this.long.unshift(event);
      if (this.long.length > LONG_LIMIT) this.long.pop();
    }

    return event;
  }

  stats(): { short: number; mid: number; long: number } {
    return { short: this.short.length, mid: this.mid.length, long: this.long.length };
  }

  recent(limit = 12): MemoryEvent[] {
    return [...this.short, ...this.mid, ...this.long].slice(0, limit);
  }

  all(): MemoryEvent[] {
    return [...this.short, ...this.mid, ...this.long];
  }
}
