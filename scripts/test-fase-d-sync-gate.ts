/**
 * Fase D — gate sync 8.3/8.4 + blindagens operacionais.
 * npx tsx scripts/test-fase-d-sync-gate.ts
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const SCRIPTS = [
  "test-app-data-domain-notify-h83.ts",
  "test-sync-tier-plan-h84.ts",
  "test-h814e-operacional-reset-safe.ts",
  "test-sync-001-s1-fullreset.ts",
];

let failed = 0;
for (const script of SCRIPTS) {
  process.stdout.write(`${script} … `);
  const r = spawnSync("npx", ["tsx", join(ROOT, "scripts", script)], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (r.status === 0) {
    console.log("OK");
  } else {
    failed += 1;
    console.log("FAIL");
  }
}

if (failed) process.exit(1);
console.log("\nFase D sync gate OK");
