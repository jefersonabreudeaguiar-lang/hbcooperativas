import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cli = require.resolve("tsx/cli");
const fixtures = [
  "test-auth-mfa-claim.ts",
  "test-storage-archive.mjs",
  "test-repasse-ciclo-completo.ts",
  "test-hb-operacional-financial-projection.ts",
  "test-hb-payment-retry-service.ts",
  "test-hb-owned-balance-foundation.ts",
  "test-hb-cashback-receivable-projection.ts",
  "test-hb-credit-repasse-preview.ts",
  "test-hb-credit-discount-settlement.ts",
  "test-auth-schema-status.ts",
  "test-homologation-build-guard.mjs",
  "test-responsavel-avulsos-cota.ts",
  "test-hb-credit-market-receivables.ts",
  "test-responsavel-paridade-totais-a-pagar.ts",
  "test-responsavel-adicionar-imagens.ts",
  "test-staff-gestao-tenant-switch.ts",
  "test-pagamento-confirmado-responsavel.ts",
  "test-hb-credit-p0-security.ts",
  "test-hb-credit-fail-closed-p0.ts",
  "test-image-pipeline.ts",
];

// Estes testes usam fixtures e clientes simulados; não recebem credenciais reais.
const fixtureEnv = { ...process.env };
for (const name of Object.keys(fixtureEnv)) {
  if (/SUPABASE|DATABASE_URL|ASAAS|AUTH_SECRET|CRON_SECRET/i.test(name)) delete fixtureEnv[name];
}
for (const file of fixtures) {
  const result = spawnSync(process.execPath, [cli, `scripts/${file}`], {
    env: fixtureEnv, stdio: "inherit", timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    console.error(`Falha na validação isolada: ${file}`);
    process.exit(result.status || 1);
  }
}
console.log(`PASS: ${fixtures.length} suítes locais, sem credenciais de produção.`);
