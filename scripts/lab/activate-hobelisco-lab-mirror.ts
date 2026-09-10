#!/usr/bin/env npx tsx
/**
 * Ativa e valida Hobelisco LAB espelho (Fase 0) — fronteira LAB ↔ produção
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertHobeliscoLabMirrorReady, checkHobeliscoLabMirrorHealth } from "@/lib/lab/hobeliscoLabMirrorConfig";
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
  console.log("=== Hobelisco LAB Espelho — Fase 0 — Ativação ===\n");
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env.hobelisco-lab"));

  const health = await checkHobeliscoLabMirrorHealth();
  const { boundary, config, gates } = health;

  console.log(`Deploy: ${boundary.deployKind} | Hobelisco env: ${config.environment}`);
  console.log(`Espelho: ${config.mirrorEnabled ? "ON" : "OFF"} | LAB deploy marker: ${config.labDeploy ? "OK" : "MISSING"}`);
  console.log(`Fronteira strict: ${boundary.boundaryStrict ? "SIM" : "NÃO"}`);
  console.log(`App Supabase ref: ${boundary.fingerprint.appSupabaseHost ?? "—"}`);
  console.log(`Hobelisco Supabase ref: ${boundary.fingerprint.hobeliscoSupabaseHost ?? "—"}`);
  console.log(`Produção bloqueada (ref): ${boundary.fingerprint.productionRefBlocked ?? "—"}\n`);

  for (const [k, v] of Object.entries(gates)) {
    console.log(`${v ? "[PASS]" : "[FAIL]"} gate_${k}`);
  }

  if (boundary.tripwires.length) {
    console.log("\nTripwires:");
    for (const t of boundary.tripwires) {
      console.log(`  [${t.severity}] ${t.id}: ${t.message}`);
    }
  }

  if (health.issues.length) {
    console.log("\nProblemas:");
    for (const i of health.issues) console.log(`  - ${i}`);
  }
  if (health.recommendations.length) {
    console.log("\nRecomendações:");
    for (const r of health.recommendations) console.log(`  - ${r}`);
  }

  const ready = await assertHobeliscoLabMirrorReady();
  if (ready.ok) {
    const init = initHobeliscoObserver();
    console.log(`\nObserver init: ${init.enabled ? "RUNNING" : init.reason}`);
    const obs = getHobeliscoObserver();
    if (obs?.isRunning()) {
      const hb = obs.heartbeat();
      console.log(`Heartbeat: ${hb.status}`);
    }
    const overview = await buildHobeliscoAdminOverview();
    console.log(`Admin overview: enabled=${overview.enabled} running=${overview.running}`);
  }

  const verdict = ready.ok ? "LAB-MIRROR-GREEN" : "LAB-MIRROR-RED";
  console.log(`\nVeredito: ${verdict}`);
  console.log("\nPróximos passos:");
  console.log("  1. Deploy Preview/LAB com .env.hobelisco-lab.example (NUNCA no Vercel produção)");
  console.log("  2. npm run dev");
  console.log("  3. /admin → Hobelisco → badge Espelho LAB");
  console.log("  4. GET /api/admin/hobelisco/lab-health (como admin)");
  console.log("  5. docs/hobelisco/lab-mirror-runbook.md");

  process.exit(ready.ok ? 0 : 1);
}

void main();
