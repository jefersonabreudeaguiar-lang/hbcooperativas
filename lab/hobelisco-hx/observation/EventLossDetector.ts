/** Detecção de perda de observações */

import type { ObservationLossRecord } from "./types";

export class EventLossDetector {
  private losses: ObservationLossRecord[] = [];
  private received = 0;
  private persisted = 0;

  recordReceived(count = 1): void {
    this.received += count;
  }

  recordPersisted(count = 1): void {
    this.persisted += count;
  }

  detectLoss(source: string, expectedPersisted: number, actualPersisted: number, reason: string): ObservationLossRecord | null {
    const gap = expectedPersisted - actualPersisted;
    if (gap <= 0) return null;
    const record: ObservationLossRecord = {
      lossDetected: true,
      estimatedCount: gap,
      source,
      reason,
      timestamp: new Date().toISOString(),
    };
    this.losses.push(record);
    return record;
  }

  getLosses(): ObservationLossRecord[] {
    return [...this.losses];
  }

  getIntegrityRate(): number {
    if (this.received === 0) return 1;
    return Math.min(1, this.persisted / this.received);
  }

  summary(): { received: number; persisted: number; losses: number } {
    return {
      received: this.received,
      persisted: this.persisted,
      losses: this.losses.reduce((s, l) => s + l.estimatedCount, 0),
    };
  }
}

export function computeObservationIntegrityRate(received: number, persisted: number): number {
  if (received === 0) return 0;
  return Math.round((persisted / received) * 1000) / 1000;
}
