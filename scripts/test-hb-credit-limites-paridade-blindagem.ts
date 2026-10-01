/**
 * Blindagem paridade HB — ensurePersisted + prepareHbCreditPaymentAuthorize unificado.
 * npx tsx scripts/test-hb-credit-limites-paridade-blindagem.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

const storage = read("src/lib/supabase/contaCoopStorage.ts");
assert(
  storage.includes("export async function ensureHbCreditLimiteAutoritativoPersistido"),
  "ensureHbCreditLimiteAutoritativoPersistido exportado"
);
assert(
  storage.includes("ensurePersisted?: boolean"),
  "getLimiteCooperadoAlinhadoAEntregas aceita ensurePersisted"
);
assert(
  /prepareHbCreditPaymentAuthorize[\s\S]*ensureHbCreditLimiteAutoritativoPersistido/.test(storage),
  "pagamento reutiliza ensure autoritativo"
);

const account = read("src/app/api/credit/account/route.ts");
assert(account.includes("ensurePersisted: true"), "account GET liga blindagem");

console.log("\nHB limites paridade blindagem OK");
