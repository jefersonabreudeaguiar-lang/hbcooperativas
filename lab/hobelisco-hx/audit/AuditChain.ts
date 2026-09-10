/** Cadeia de auditoria append-only com hash encadeado */

import { createHash, randomBytes } from "crypto";
import type { AuditChainEvent } from "../types";

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

export class AuditChain {
  private events: AuditChainEvent[] = [];

  append(kind: string, payload: Record<string, unknown>): AuditChainEvent {
    const previous = this.events[this.events.length - 1] ?? null;
    const at = new Date().toISOString();
    const body = JSON.stringify({ kind, payload, at, previous: previous?.eventHash ?? null });
    const event: AuditChainEvent = {
      id: `evt_${Date.now()}_${randomBytes(4).toString("hex")}`,
      kind,
      payload,
      eventHash: hashPayload(body),
      previousEventHash: previous?.eventHash ?? null,
      at,
    };
    this.events.push(event);
    return event;
  }

  getHead(): AuditChainEvent | null {
    return this.events[this.events.length - 1] ?? null;
  }

  get length(): number {
    return this.events.length;
  }

  verify(): { ok: boolean; brokenAt?: number } {
    for (let i = 0; i < this.events.length; i += 1) {
      const ev = this.events[i];
      const prev = i > 0 ? this.events[i - 1] : null;
      if (ev.previousEventHash !== (prev?.eventHash ?? null)) {
        return { ok: false, brokenAt: i };
      }
      const body = JSON.stringify({
        kind: ev.kind,
        payload: ev.payload,
        at: ev.at,
        previous: ev.previousEventHash,
      });
      if (hashPayload(body) !== ev.eventHash) {
        return { ok: false, brokenAt: i };
      }
    }
    return { ok: true };
  }

  exportEvents(): AuditChainEvent[] {
    return [...this.events];
  }
}

/** Verifica cadeia exportada — detecta adulteração (FASE 21) */
export function verifyExportedChain(events: AuditChainEvent[]): {
  ok: boolean;
  brokenAt?: number;
  reason?: string;
} {
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const prev = i > 0 ? events[i - 1] : null;
    if (ev.previousEventHash !== (prev?.eventHash ?? null)) {
      return { ok: false, brokenAt: i, reason: "previousEventHash mismatch" };
    }
    const body = JSON.stringify({
      kind: ev.kind,
      payload: ev.payload,
      at: ev.at,
      previous: ev.previousEventHash,
    });
    if (hashPayload(body) !== ev.eventHash) {
      return { ok: false, brokenAt: i, reason: "eventHash mismatch" };
    }
  }
  return { ok: true };
}
