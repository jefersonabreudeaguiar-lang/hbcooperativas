/** Learning — padrões a partir da memória (determinístico) */

import type { LearningInsight, MemoryEvent } from "../types";

export function extractLearningInsights(events: MemoryEvent[]): LearningInsight[] {
  const byKind = new Map<string, { count: number; efficacy: number[] }>();

  for (const ev of events) {
    const key = ev.kind;
    const cur = byKind.get(key) ?? { count: 0, efficacy: [] };
    cur.count += 1;
    if (ev.efficacy != null) cur.efficacy.push(ev.efficacy);
    byKind.set(key, cur);
  }

  return [...byKind.entries()]
    .map(([pattern, data]) => ({
      pattern,
      occurrences: data.count,
      suggestedRuleId: suggestRule(pattern),
      efficacyAvg:
        data.efficacy.length > 0
          ? Math.round(data.efficacy.reduce((a, b) => a + b, 0) / data.efficacy.length)
          : 0,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);
}

function suggestRule(pattern: string): string | null {
  if (pattern.includes("threat") || pattern.includes("idor")) return "AUTHZ-001";
  if (pattern.includes("sync")) return "SYNC-001";
  if (pattern.includes("financial")) return "CREDIT-001";
  if (pattern.includes("auth")) return "AUTH-001";
  return null;
}
