/** Circuit Breaker — 3 falhas abre circuito */

import type { CircuitBreakerState } from "../types";

export class CircuitBreaker {
  private failures = 0;
  private open = false;
  private lastReason: string | null = null;
  readonly threshold = 3;

  recordFailure(reason: string): CircuitBreakerState {
    this.failures += 1;
    this.lastReason = reason;
    if (this.failures >= this.threshold) {
      this.open = true;
    }
    return this.snapshot();
  }

  recordSuccess(): CircuitBreakerState {
    this.failures = 0;
    this.open = false;
    this.lastReason = null;
    return this.snapshot();
  }

  canAttemptRepair(): boolean {
    return !this.open;
  }

  snapshot(): CircuitBreakerState {
    return {
      open: this.open,
      failures: this.failures,
      threshold: this.threshold,
      lastReason: this.lastReason,
    };
  }
}
