/** Health Engine — score global + por cooperativa (lab simulado) */

import type { CooperativeHealth, HealthReport, SensorSignal } from "../types";
import { SENSOR_LABELS } from "../sensors/index";

function levelScore(level: SensorSignal["level"]): number {
  switch (level) {
    case "OK":
      return 100;
    case "WARN":
      return 70;
    case "CRIT":
      return 30;
    default:
      return 50;
  }
}

const LAB_COOPERATIVES: CooperativeHealth[] = [
  { cooperativeCnpj: "62351750000165", cooperativeName: "CoopeagriPla", score: 92, status: "OK" },
  { cooperativeCnpj: "00000000000000", cooperativeName: "Coop Simulada B", score: 78, status: "WARN" },
];

export function computeHealth(sensors: SensorSignal[], coopAdjust = 0): HealthReport {
  const dimensions = sensors.map((s) => ({
    id: s.sensor.toLowerCase(),
    label: SENSOR_LABELS[s.sensor],
    score: levelScore(s.level),
    status: s.level,
  }));

  const securityDim = dimensions.find((d) => d.id === "behavior" || d.id === "auth");
  const securityScore = securityDim?.score ?? 100;

  const cooperatives = LAB_COOPERATIVES.map((c) => ({
    ...c,
    score: Math.max(0, Math.min(100, c.score - coopAdjust)),
    status: (c.score - coopAdjust < 60 ? "CRIT" : c.score - coopAdjust < 80 ? "WARN" : "OK") as SensorSignal["level"],
  }));

  const overall =
    dimensions.length === 0
      ? 0
      : Math.round(
          (dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length + securityScore) / 2
        );

  return {
    overall,
    dimensions,
    cooperatives,
    computedAt: new Date().toISOString(),
  };
}
