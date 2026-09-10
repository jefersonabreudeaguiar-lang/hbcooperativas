/** Relógio determinístico opcional para testes LAB */

let frozen = false;
let offsetMs = 0;
let baseNow = Date.now();

export function resetLabClock(now = Date.now()): void {
  baseNow = now;
  offsetMs = 0;
  frozen = false;
}

export function nowIso(): string {
  const t = frozen ? baseNow + offsetMs : Date.now() + offsetMs;
  return new Date(t).toISOString();
}

export function advanceTime(ms: number): void {
  if (frozen) {
    offsetMs += ms;
  } else {
    baseNow = Date.now() + offsetMs + ms;
    offsetMs = 0;
  }
}

export function freezeTime(): void {
  if (!frozen) {
    baseNow = Date.now() + offsetMs;
    offsetMs = 0;
    frozen = true;
  }
}

export function unfreezeTime(): void {
  frozen = false;
}

export function getLabClockState(): { frozen: boolean; offsetMs: number; now: string } {
  return { frozen, offsetMs, now: nowIso() };
}
