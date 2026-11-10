import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const cli = createRequire(import.meta.url).resolve('tsx/cli');
const tests = [
  'test-entregas-somas-805.ts', 'test-nota-totais-guard.ts',
  'test-conferencia-input-hotpath-805.mjs', 'test-financeiro-entry-freshness-805.mjs', 'test-cooperado-finance-cadastros-805.ts',
  'test-delivery-owner-names-804.ts',
  'test-staff-storage-quota-803.ts', 'test-staff-entry-verified-cache-803.ts',
  'test-staff-entry-coordination-802.ts',
  'test-contador-conciliacao-800.ts', 'test-contador-acesso-operacional.ts',
  'test-notas-confirmacao-completa-799.ts',
  'test-staff-entrada-cloud-799.ts', 'test-staff-entrada-retry.ts', 'test-staff-entrada-sem-valores-antigos.tsx',
  'test-staff-gestao-lkg-por-cnpj.ts', 'test-staff-gestao-nunca-zera-snapshot.ts',
  'test-financeiro-pendentes-798.ts',
  'test-api-hb-pendentes-798.mjs',
  'test-cooperado-card-refresh-feedback.mjs',
  'test-pagamento-ciclo-historico.ts',
  'test-cooperado-history-summary.ts',
  'test-release-805-boundary.mjs', 'test-session-revocation.mjs', 'test-auth-fail-closed.mjs',
  'test-auth-mfa-claim.ts', 'test-livro-caixa-sequencia-stale.ts',
  'test-livro-caixa-pagamento-completo.ts', 'test-livro-caixa-export-contabil.ts',
  'test-responsavel-avulsos-cota.ts', 'test-responsavel-paridade-totais-a-pagar.ts',
  'test-pagamento-confirmado-responsavel.ts', 'test-hb-credit-market-receivables.ts',
  'test-staff-gestao-tenant-switch.ts', 'test-hb-credit-p0-security.ts',
  'test-hb-credit-fail-closed-p0.ts', 'test-image-pipeline.ts',
];
const fixtureEnv = { ...process.env };
for (const key of Object.keys(fixtureEnv)) if (/SUPABASE|DATABASE_URL|ASAAS|AUTH_SECRET|CRON_SECRET/i.test(key)) delete fixtureEnv[key];
for (const file of tests) {
  const r = spawnSync(process.execPath, [cli, `scripts/${file}`], { env: fixtureEnv, stdio: 'inherit', timeout: 120000 });
  if (r.error || r.status !== 0) { console.error(`FAIL: ${file}`); process.exit(1); }
}
console.log(`PASS: ${tests.length} suítes da candidata 805, sem credenciais reais.`);


