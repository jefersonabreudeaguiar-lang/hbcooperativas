/** Metabolismo — DEFENSE_BUDGET regula sensores ativos */

import type { DefenseBudget, DefenseBudgetLevel, SensorSignal } from "../types";

const MAX_SENSORS = 10;

export function computeDefenseBudget(
  fortressLevel: DefenseBudgetLevel,
  sensors: SensorSignal[]
): DefenseBudget {
  const critCount = sensors.filter((s) => s.level === "CRIT" || s.level === "WARN").length;

  let activeSensors: number;
  let description: string;

  switch (fortressLevel) {
    case "FORTRESS":
      activeSensors = MAX_SENSORS;
      description = "Risco alto — todos os sensores ativos";
      break;
    case "DEFENSIVE":
      activeSensors = Math.max(8, MAX_SENSORS - 1);
      description = "Risco elevado — sensores ampliados";
      break;
    case "ELEVATED":
      activeSensors = Math.max(6, 6 + Math.min(critCount, 2));
      description = "Observação reforçada";
      break;
    default:
      activeSensors = Math.max(4, 6 - Math.floor(critCount / 2));
      description = "Ambiente normal — consumo reduzido";
  }

  return {
    level: fortressLevel,
    activeSensors: Math.min(MAX_SENSORS, activeSensors),
    maxSensors: MAX_SENSORS,
    description,
  };
}
