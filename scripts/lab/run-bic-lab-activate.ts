#!/usr/bin/env npx tsx
import { assertBicLabMirrorReady, checkBicLabMirrorHealth } from "@/lib/lab/bicLabMirrorConfig";
import { loadBicLabEnv } from "./loadBicLabEnv";

async function main() {
  console.log("=== BIC LAB Espelho — Ativação ===\n");
  const { hasBicLab } = loadBicLabEnv();
  if (!hasBicLab) {
    console.warn("Aviso: .env.bic-lab ausente — use .env.bic-lab.example (Supabase homolog).\n");
  }

  const health = await checkBicLabMirrorHealth();
  const { boundary, config, gates } = health;

  console.log(`Deploy: ${boundary.deployKind} | BIC env: ${config.bicEnvironment}`);
  console.log(`Espelho: ${config.mirrorEnabled ? "ON" : "OFF"} | LAB UI: ${config.labUiEnabled ? "ON" : "OFF"}`);
  console.log(`App Supabase ref: ${boundary.fingerprint.appSupabaseRef ?? "—"}\n`);

  for (const [k, v] of Object.entries(gates)) {
    console.log(`${v ? "[PASS]" : "[FAIL]"} gate_${k}`);
  }

  if (health.issues.length) {
    console.log("\nProblemas:");
    for (const i of health.issues) console.log(`  - ${i}`);
  }

  const ready = await assertBicLabMirrorReady();
  const verdict = ready.ok ? "LAB-BIC-GREEN" : "LAB-BIC-RED";
  console.log(`\nVeredito: ${verdict}`);
  console.log("\nPassos:");
  console.log("  1. npm run dev (porta local)");
  console.log("  2. GET /api/lab/bic/health");
  console.log("  3. /lab/bic");
  console.log("  4. npm run lab:bic-full-audit");
  console.log("  5. npm run dev:bic-lab  (Next com Supabase homolog via .env.bic-lab)");
  console.log("  6. scripts/backups/BIC-LAB-ESPELHO-RUNBOOK.md");

  if (!ready.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
