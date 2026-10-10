import {
  applyHbCreditCooperadoTransferSchemaSql,
  checkHbCreditCooperadoTransferSchema,
} from "../src/lib/supabase/hbCreditCooperadoTransferSchema";
import { getSupabaseAdmin } from "../src/lib/supabase/admin";

async function main() {
  const applied = await applyHbCreditCooperadoTransferSchemaSql();
  console.log("apply:", applied);
  if (!applied.ok) process.exit(1);
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error("Supabase admin não configurado.");
    process.exit(1);
  }
  const check = await checkHbCreditCooperadoTransferSchema(admin);
  console.log("check:", check);
  process.exit(check.ok ? 0 : 1);
}

void main();
