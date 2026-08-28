/**
 * Ativação HB Credit — sequência completa (preserva app existente).
 *
 * 1. Aplica migrations (aditivas, hb_credit_*)
 * 2. Homologação (fundação + integridade cooperativas/notas + build)
 * 3. Orienta flags Vercel (requer login vercel CLI ou painel)
 *
 * Uso: npx tsx scripts/activate-hb-credit-sequence.ts
 */

import { spawnSync } from "node:child_process";

function run(label: string, cmd: string, args: string[], env?: NodeJS.ProcessEnv): boolean {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  return r.status === 0;
}

function main() {
  console.log("HB Credit — sequência de ativação segura\n");

  const migrated = run("1/3 Migrations Supabase", "npm", ["run", "apply:hb-credit-migrations"]);
  if (!migrated) {
    console.error("\nMigrations não aplicadas.");
    console.error("Adicione SUPABASE_DB_PASSWORD em .env.local (Supabase → Project Settings → Database)");
    console.error("Depois rode: npm run apply:hb-credit-migrations");
    process.exit(1);
  }

  const homologated = run("2/3 Homologação", "npm", ["run", "homologate:hb-credit"]);
  if (!homologated) {
    console.error("\nHomologação falhou — não ative flags em produção.");
    process.exit(1);
  }

  console.log("\n=== 3/3 Flags Vercel (produção) ===\n");
  console.log("No painel Vercel → Project → Settings → Environment Variables, adicione:");
  console.log("  HB_CREDIT_ENABLED=true");
  console.log("  NEXT_PUBLIC_HB_CREDIT_ENABLED=true");
  console.log("Marque Production + Preview. Depois: Redeploy.\n");
  console.log("Ou, com `vercel login` no terminal:");
  console.log('  npx vercel env add HB_CREDIT_ENABLED production');
  console.log('  npx vercel env add NEXT_PUBLIC_HB_CREDIT_ENABLED production');
  console.log("  npx vercel --prod\n");
  console.log("App existente preservado: cooperativas, notas, ficha corrida inalterados.");
  console.log("Conta Coop só aparece após as duas flags true + redeploy.");
}

main();
