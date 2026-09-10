#!/usr/bin/env npx tsx
/**
 * Ativa e valida Hobelisco STAGING observe-only
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkStagingObserveHealth } from "@/lib/lab/hobeliscoStagingConfig";
import { buildHobeliscoAdminOverview } from "@/lib/lab/hobeliscoAdminOverview";
import { initHobeliscoObserver, getHobeliscoObserver } from "@lab/hobelisco-hx/observer/ObserverSingleton";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  console.log("=== Hobelisco STAGING Observe-Only — Ativação ===\n");
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const health = checkStagingObserveHealth();
  console.log(`Ambiente: ${health.config.environment}`);
  console.log(`V2: ${health.config.v2Enabled} | Observe-only: ${health.config.observeOnly} | Staging: ${health.config.stagingEnabled}`);
  console.log(`Persistência Supabase: ${health.config.persistenceConfigured ? "OK" : "NÃO CONFIGURADA"}`);
  console.log(`Probe coop: ${health.config.probeCoopCnpj ?? "não definido"}\n`);

  for (const [k, v] of Object.entries(health.gates)) {
    console.log(`${v ? "[PASS]" : "[FAIL]"} gate_${k}`);
  }

  if (health.issues.length) {
    console.log("\nProblemas:");
    for (const i of health.issues) console.log(`  - ${i}`);
  }
  if (health.recommendations.length) {
    console.log("\nRecomendações:");
    for (const r of health.recommendations) console.log(`  - ${r}`);
  }

  if (health.ok) {
    const init = initHobeliscoObserver();
    console.log(`\nObserver init: ${init.enabled ? "RUNNING" : init.reason}`);
    const obs = getHobeliscoObserver();
    if (obs?.isRunning()) {
      const hb = obs.heartbeat();
      console.log(`Heartbeat: ${hb.status}`);
    }
    const overview = await buildHobeliscoAdminOverview();
    console.log(`Admin overview: enabled=${overview.enabled} running=${overview.running}`);
    console.log(`Observations: ${overview.metrics?.observationsReceived ?? 0} | Incidents: ${overview.metrics?.incidentsObserved ?? 0}`);
  }

  const verdict = health.ok ? "STAGING-OBSERVE-GREEN" : "STAGING-OBSERVE-RED";
  console.log(`\nVeredito: ${verdict}`);
  console.log("\nPróximos passos:");
  console.log("  1. npm run dev");
  console.log("  2. Acesse /admin → Hobelisco");
  console.log("  3. GET /api/admin/hobelisco/staging-health (como admin)");
  console.log("  4. Credit Watch permanece OFF até nova autorização");

  process.exit(health.ok ? 0 : 1);
}

void main();
