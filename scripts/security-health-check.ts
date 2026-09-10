/**
 * Verifica stack de segurança + roda testes fundação
 * npm run security:health
 */
import { spawnSync } from "node:child_process";
import { buildSecurityStackHealth } from "../src/lib/security/securityStackHealth";

const health = buildSecurityStackHealth(process.env);

console.log("=== HB Coop — Security Health ===\n");
console.log(`API security enforced: ${health.apiSecurityEnforced}`);
console.log(`Supabase configured:     ${health.supabaseConfigured}`);
console.log(`Upstash rate limit:       ${health.distributedRateLimit}`);
console.log(`CRON_SECRET:             ${health.cronSecretConfigured}`);
console.log(`Reconciliation CNPJ:     ${health.reconciliationCoopConfigured}`);
console.log(`Staff MFA policy:        ${health.staffMfaPolicyEnforced}`);
console.log(`FIELD_ENCRYPTION_KEY:    ${health.fieldEncryptionConfigured}`);

console.log("\nCrons:");
for (const c of health.crons) {
  console.log(`  ${c.schedule}  ${c.path}  — ${c.description}`);
}

if (health.recommendations.length) {
  console.log("\nRecomendações:");
  for (const r of health.recommendations) console.log(`  • ${r}`);
}

console.log("\n=== Rodando test:owner-security ===\n");
const result = spawnSync("npm", ["run", "test:owner-security"], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});

process.exit(result.status === 0 ? 0 : 1);
