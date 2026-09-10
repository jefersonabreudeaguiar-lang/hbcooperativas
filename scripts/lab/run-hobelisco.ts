#!/usr/bin/env npx tsx
/** Comando principal — inicia organismo LAB */

import { runFullOrganismAudit } from "@lab/hobelisco-hx/full-audit/runFullAudit";
import { replay } from "@lab/hobelisco-hx/evolution/ReplayEngine";
import { getHobeliscoLabOrganism, resetHobeliscoLabOrganism } from "@lab/hobelisco-hx/organism/HobeliscoLabOrganism";

process.env.HOBELISCO_ENVIRONMENT = "LAB";
process.env.HB_HOBELISCO_LAB_ENABLED = "true";

const args = process.argv.slice(2);
const demo = args.includes("--demo");
const scenarioIdx = args.indexOf("--scenario");
const scenario = scenarioIdx >= 0 ? args[scenarioIdx + 1] : null;
const auditOnly = args.includes("--audit");

function printStatus(): void {
  const org = getHobeliscoLabOrganism();
  const status = org.getOrganismStatus();
  console.log("\n── ORGANISM STATUS ──");
  console.log(`ID: ${status.identity.organismId}`);
  console.log(`State: ${status.vitalState} | Health: ${status.health}/100`);
  console.log(`DNA: ${status.dna} | Gen: ${status.generation}`);
  console.log(`Heartbeat: ${status.heartbeat} | Metabolism: ${status.metabolism}`);
  console.log(`Fortress: ${status.fortress} | Risk: ${status.risk}`);
}

async function main(): Promise<void> {
  if (auditOnly) {
    const report = runFullOrganismAudit();
    console.log(`Audit: ${report.organismVerdict} (${report.passed}/${report.totalTests})`);
    process.exit(report.organismVerdict === "ORGANISM-RED" ? 1 : 0);
    return;
  }

  const org = resetHobeliscoLabOrganism();
  console.log("HOBELISCO HX LAB — booting organism...");
  const boot = org.boot();
  console.log(`Boot: ${boot.success ? "OK" : "SAFE_MODE"} (${boot.checks.length} checks)`);
  if (boot.failures.length) {
    for (const f of boot.failures) console.log(`  FAIL: ${f.name} — ${f.detail}`);
  }

  if (demo) {
    console.log("\n── DEMO: full life ──");
    const life = org.runFullLifeCycle();
    console.log(`Life cycle: ${life.success ? "OK" : "PARTIAL"}`);
    console.log(`States: ${life.states.join(" → ")}`);
    org.runHibernationScenario();
    printStatus();
    org.stop();
    return;
  }

  if (scenario) {
    console.log(`\n── Scenario: ${scenario} ──`);
    switch (scenario) {
      case "full-life":
        org.runFullLifeCycle();
        break;
      case "financial-attempt":
        org.core.attemptFinancialAction({ action: "CREATE_CREDIT", target: "demo" });
        break;
      case "sensor-death":
        org.components.stopComponent("sensor");
        org.pulse();
        break;
      case "memory-failure":
        org.components.stopComponent("memory");
        org.pulse();
        break;
      case "guardian-failure":
        org.runGuardianFalseSuccessScenario();
        break;
      default:
        org.processLabEvent(scenario);
        org.pulse();
    }
    printStatus();
    org.stop();
    return;
  }

  console.log("\n── Pulse loop (3 pulses) ──");
  org.startPulseLoop(3);
  printStatus();
  org.stop();
  console.log("\nOrganism stopped cleanly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
