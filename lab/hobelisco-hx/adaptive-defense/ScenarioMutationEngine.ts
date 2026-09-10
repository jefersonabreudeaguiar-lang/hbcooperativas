import type { GeneratedScenario } from "./types";

export type MutationOp =
  | "timing"
  | "sequence"
  | "frequency"
  | "route"
  | "identity"
  | "order"
  | "concurrency"
  | "encoding";

const ROUTES = ["/api/auth/login", "/api/sync", "/api/credit", "/api/admin", "/api/cooperativa-sync"];
const IDENTITIES = ["anonymous", "cooperado", "responsavel", "admin", "expired_session"];

export function mutateScenario(base: GeneratedScenario, op: MutationOp, rng: () => number): GeneratedScenario {
  const clone = { ...base, sequence: [...base.sequence] };

  switch (op) {
    case "timing":
      clone.timingMs = Math.floor(clone.timingMs * (0.5 + rng() * 2));
      break;
    case "frequency":
      clone.frequency = Math.max(1, Math.floor(clone.frequency * (0.5 + rng() * 3)));
      break;
    case "route":
      clone.route = ROUTES[Math.floor(rng() * ROUTES.length)];
      break;
    case "identity":
      clone.identityState = IDENTITIES[Math.floor(rng() * IDENTITIES.length)];
      break;
    case "sequence":
      clone.sequence = [...clone.sequence.reverse(), "mutation"];
      break;
    case "order":
      clone.sequence.sort(() => rng() - 0.5);
      break;
    case "concurrency":
      clone.frequency = Math.max(clone.frequency, Math.floor(rng() * 100) + 10);
      clone.timingMs = Math.min(clone.timingMs, 100);
      break;
    case "encoding":
      clone.sequence = clone.sequence.map((s) => `${s}_enc${Math.floor(rng() * 9)}`);
      break;
  }

  clone.scenarioId = `${base.scenarioId}-M-${op}`;
  clone.isUnknownVariant = true;
  clone.phase = "GENERATED";
  return clone;
}

export function generateMutations(base: GeneratedScenario, seed: number, count = 5): GeneratedScenario[] {
  const ops: MutationOp[] = ["timing", "sequence", "frequency", "route", "identity", "order", "concurrency", "encoding"];
  let s = seed;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out: GeneratedScenario[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(mutateScenario(base, ops[i % ops.length], rng));
  }
  return out;
}
