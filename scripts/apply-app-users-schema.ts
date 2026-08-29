/**
 * Cria tabela app_users no Supabase (obrigatório para Conta Coop).
 * Uso: npx tsx scripts/apply-app-users-schema.ts
 */
import { applyAppUsersSchemaSql } from "../src/lib/supabase/appUsersSchema";

async function main() {
  console.log("Aplicando app_users + security_audit_log...\n");
  const result = await applyAppUsersSchemaSql();
  if (!result.ok) {
    console.error("Erro:", result.error);
    console.error("\nAlternativa: Supabase → SQL Editor → cole supabase/migrations/APPLY_APP_USERS.sql");
    process.exit(1);
  }
  console.log("Concluído: app_users OK.");
}

main();
