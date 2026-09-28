#!/usr/bin/env npx tsx
/**
 * Bateria BIC LAB — in-memory + boundary. Não escreve Supabase.
 */
import { spawnSync } from "node:child_process";
import { loadBicLabEnv } from "./loadBicLabEnv";

const STEPS = [
  "test:bic-lab-boundary",
  "test:bic-tenant",
  "test:bic-facade-tenant",
  "test:bic-fallback-observability",
  "test:bic-shadow",
  "test:bic-b3.1-integration",
  "test:cooperado-financeiro",
  "test:h204-orlando-global",
  "test:bic-lab-b4-wiring",
  "test:bic-lab-full-wiring",
  "test:cooperado-inicio-card-policy",
];

function main() {
  loadBicLabEnv();
  console.log("=== BIC LAB — auditoria completa ===\n");

  const failed: string[] = [];
  for (const step of STEPS) {
    console.log(`--- npm run ${step} ---`);
    const r = spawnSync("npm", ["run", step], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    if (r.status !== 0) failed.push(step);
  }

  console.log("\n=== Resumo ===");
  if (failed.length) {
    console.error(`Falhas: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log("Veredito: LAB-BIC-AUDIT-GREEN");
}

main();
