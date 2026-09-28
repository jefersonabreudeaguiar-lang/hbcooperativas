#!/usr/bin/env npx tsx
/**
 * Valida env de rollout do app oficial — sem tocar dados.
 * Uso local: carregue .env.local ou exporte vars do Vercel antes de rodar.
 */
import { evaluateBicLabBoundary } from "../src/lib/lab/bicLabBoundary";
import { isBicCentralReadAuthorityEnabled } from "../src/lib/bic/bicCentralReadAuthority";
import { isBicLabFullIntegrationEnabled } from "../src/lib/lab/bicLabFullIntegration";

const env = process.env;
const boundary = evaluateBicLabBoundary(env);
const central = isBicCentralReadAuthorityEnabled(env);
const full = isBicLabFullIntegrationEnabled(env);

console.log("=== Rollout app oficial (somente leitura env) ===");
console.log("deployKind:", boundary.deployKind);
console.log("productionLocked:", boundary.productionLocked);
console.log("labFlagsActive:", boundary.tripwires.filter((t) => t.id === "PRODUCTION_BIC_LAB_FLAGS").length ? "BLOCK" : "none");
console.log("centralRead:", central ? "ON" : "OFF");
console.log("fullRead:", full ? "ON" : "OFF");
console.log("supabaseRef:", boundary.fingerprint.appSupabaseRef ?? "?");

let ok = true;
if (!boundary.productionLocked) {
  console.error("FAIL: defina NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK=true no oficial.");
  ok = false;
}
if (boundary.tripwires.some((t) => t.severity === "BLOCK")) {
  for (const t of boundary.tripwires.filter((x) => x.severity === "BLOCK")) {
    console.error("FAIL:", t.message);
  }
  ok = false;
}
if (!central) {
  console.error("FAIL: defina NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL=true");
  ok = false;
}

if (ok) {
  console.log("\nOK — env pronta para deploy código (dados na nuvem preservados).");
  process.exit(0);
}
process.exit(1);
