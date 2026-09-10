/** Singleton do observador V2 — fire-and-forget, fail-silent */

import type { RawObservationInput } from "../observation/Normalizer";
import type { HobeliscoObservationEvent } from "../observation/types";
import { createPersistenceId } from "../persistence/HobeliscoPersistence";
import { HobeliscoObserver } from "./HobeliscoObserver";

let observer: HobeliscoObserver | null = null;
let initAttempted = false;

export function initHobeliscoObserver(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  reason?: string;
} {
  if (initAttempted) {
    return observer?.isRunning()
      ? { enabled: true }
      : { enabled: false, reason: "not_running" };
  }
  initAttempted = true;

  const instance = new HobeliscoObserver(env);
  const start = instance.canStart(env);
  if (!start.started) {
    return { enabled: false, reason: start.reason };
  }

  instance.start(env);
  observer = instance;
  return { enabled: true };
}

export function getHobeliscoObserver(): HobeliscoObserver | null {
  return observer;
}

export function resetHobeliscoObserver(): void {
  observer?.stop();
  observer = null;
  initAttempted = false;
}

export function observeRaw(raw: RawObservationInput): void {
  const obs = observer;
  if (!obs?.isRunning()) return;
  void obs.pipeline.observe(raw).catch(() => {});
}

export function observeNormalized(event: HobeliscoObservationEvent): void {
  const obs = observer;
  if (!obs?.isRunning()) return;
  void obs.pipeline.observeFromEvent(event).catch(() => {});
}

export async function runObserverCycle(): Promise<{
  sensorCount: number;
  probeCount: number;
  heartbeat: ReturnType<HobeliscoObserver["heartbeat"]>;
}> {
  const obs = observer;
  if (!obs?.isRunning()) {
    return { sensorCount: 0, probeCount: 0, heartbeat: null as never };
  }
  const sensorCount = await obs.observeSensors();
  const probeCount = 0;
  const heartbeat = obs.heartbeat();
  await obs.persistence.saveHeartbeat({
    id: createPersistenceId("hb_v2"),
    status: heartbeat.status,
    payload: { lines: heartbeat.lines, checks: heartbeat.checks },
    at: heartbeat.emittedAt,
    schemaVersion: "2.0",
    environment: obs.environment,
  });
  return { sensorCount, probeCount, heartbeat };
}
