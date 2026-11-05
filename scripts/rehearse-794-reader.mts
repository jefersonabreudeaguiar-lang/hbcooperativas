import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { bridgeFrozenOperacional } from "./bridge-operacional-rollback.mjs";

const url = "https://ocyfzramxvxqbtkorubn.supabase.co";
const cnpj = "99999999999996";
assert.equal(process.env.VERCEL_PROJECT_ID, "prj_1dqke8xRjtzsCouFEczEB4ZgmF10");
assert.equal(process.env.VERCEL_ENV, "preview");
assert.equal(process.env.HB_HOMOLOGATION_ONLY, "true");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, url);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(key);
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const revision = "9c6ce003-0ebe-46e9-a519-cd00bb5fda39";
const plan = await bridgeFrozenOperacional(client, revision, undefined);
assert.equal(plan.beforeHash, "absent");
try {
  const restored = await bridgeFrozenOperacional(client, revision, "absent");
  assert.equal(restored.targetHash, plan.targetHash);
  const readBy794 = await fetchOperacionalSync(client, cnpj);
  assert.ok(readBy794);
  assert.equal(readBy794.pagamentosCooperado[0]?.id, "fixture-pix-794");
  assert.equal(readBy794.pagamentosCooperado[0]?.status, "confirmado");
  assert.equal(readBy794.livroCaixa?.[0]?.id, "fixture-caixa-794");
  assert.equal(readBy794.livroCaixa?.[0]?.valor, 25);
} finally {
  const after = await bridgeFrozenOperacional(client, revision, undefined);
  if (after.beforeHash === plan.targetHash) {
    const result = await client.storage.from("hb-cooperativa-sync").remove([`${cnpj}/operacional.json`]);
    assert.ok(!result.error);
  }
  assert.equal((await bridgeFrozenOperacional(client, revision, undefined)).beforeHash, "absent");
}
console.log("PASS HB 794 rollback reader: confirmed payment and cash-book entry read with the exact 794 storage adapter.");
