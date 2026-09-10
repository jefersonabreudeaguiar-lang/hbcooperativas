/** Heartbeat contínuo — HOBELISCO_HEARTBEAT */

import type { Heartbeat, HobeliscoState, FortressLevel, SensorSignal } from "../types";

export function emitHeartbeat(input: {
  healthScore: number;
  state: HobeliscoState;
  fortressLevel: FortressLevel;
  threatCount: number;
  sensors: SensorSignal[];
  auditChainOk: boolean;
  memoryOk: boolean;
}): Heartbeat {
  const sensorLines = input.sensors.slice(0, 6).map((s) => {
    const label = s.sensor.replace("_", " ");
    return `${label} ${s.level === "OK" ? "OK" : s.level}`;
  });

  const selfWatchOk =
    input.auditChainOk &&
    input.memoryOk &&
    input.sensors.length >= 4 &&
    input.state !== "DEAD";

  const lines = [
    `HEALTH ${input.healthScore}`,
    `STATE ${input.state}`,
    `THREATS ${input.threatCount}`,
    "",
    ...sensorLines,
    "",
    selfWatchOk ? "Self-watch OK" : "Self-watch DEGRADED",
  ];

  return {
    healthScore: input.healthScore,
    state: input.state,
    fortressLevel: input.fortressLevel,
    threatCount: input.threatCount,
    selfWatchOk,
    lines,
    emittedAt: new Date().toISOString(),
  };
}
