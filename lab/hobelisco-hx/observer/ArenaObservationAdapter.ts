/** Arena → V2 Observation Adapter (opcional, Arena V1 intacta) */

import { ARENA_SCENARIOS } from "../arena/SimulationScenario";
import type { HobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import { ObservationPipeline } from "../observation/ObservationPipeline";
import type { HobeliscoPersistence } from "../persistence/HobeliscoPersistence";
import { getInMemoryPersistence } from "../persistence/InMemoryPersistence";

export async function feedArenaScenarioToV2Pipeline(
  scenarioId: string,
  environment: HobeliscoEnvironment = "LAB"
): Promise<{ processed: number; scenarioFound: boolean }> {
  const scenario = ARENA_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return { processed: 0, scenarioFound: false };

  const persistence = getInMemoryPersistence(true);
  const pipeline = new ObservationPipeline(persistence, environment);

  let processed = 0;
  const r = await pipeline.observe({
    environment,
    source: "arena_adapter",
    sensor: "BEHAVIOR",
    eventType: `arena_${scenario.id}`,
    metadata: { title: scenario.title, rules: scenario.ruleIds.join(",") },
  });
  if (r.accepted) processed += 1;
  return { processed, scenarioFound: true };
}

export async function feedSyntheticBurst(
  count: number,
  persistence: HobeliscoPersistence,
  environment: HobeliscoEnvironment,
  idPrefix = "burst"
): Promise<number> {
  const pipeline = new ObservationPipeline(persistence, environment);
  let ok = 0;
  for (let i = 0; i < count; i += 1) {
    const r = await pipeline.observe({
      environment,
      source: "arena_adapter",
      sensor: "API",
      eventType: i % 3 === 0 ? "api_error" : "api_request",
      id: `${idPrefix}_${i}_${Date.now()}`,
      metadata: { index: i },
    });
    if (r.accepted) ok += 1;
  }
  return ok;
}
