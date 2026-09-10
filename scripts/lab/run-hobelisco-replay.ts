#!/usr/bin/env npx tsx
import { replay } from "@lab/hobelisco-hx/evolution/ReplayEngine";

process.env.HOBELISCO_ENVIRONMENT = "LAB";

const replayId = process.argv[2] ?? "REPLAY-DEFAULT";
const seed = Number.parseInt(process.argv[3] ?? "42", 10);

const result = replay({ replayId, seed, deterministicLab: true });

console.log("HOBELISCO LAB Replay");
console.log(`ID: ${result.replayId}`);
console.log(`Success: ${result.success}`);
console.log(`States: ${result.stateSequence.join(" → ")}`);
console.log(`Survival: ${result.metrics.survivalRate}% (${result.metrics.passed}/${result.metrics.total})`);
console.log(result.notes.join("\n"));

process.exit(result.success ? 0 : 1);
