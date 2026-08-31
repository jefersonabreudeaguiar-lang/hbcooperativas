/**
 * Cria tabela password_reset_tokens no Supabase.
 * Uso: npm run apply:password-reset
 */
import { applyPasswordResetSchemaSql } from "../src/lib/supabase/passwordResetSchema";

async function main() {
  console.log("Aplicando password_reset_tokens...\n");
  const result = await applyPasswordResetSchemaSql();
  if (!result.ok) {
    console.error("Erro:", result.error);
    console.error("\nAlternativa: Supabase → SQL Editor → cole supabase/migrations/APPLY_PASSWORD_RESET.sql");
    process.exit(1);
  }
  console.log("Concluído: password_reset_tokens OK.");
}

main();
