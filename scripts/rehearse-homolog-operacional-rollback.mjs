import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { bridgeFrozenOperacional } from "./bridge-operacional-rollback.mjs";

const url = "https://ocyfzramxvxqbtkorubn.supabase.co";
assert.equal(process.env.VERCEL_PROJECT_ID, "prj_1dqke8xRjtzsCouFEczEB4ZgmF10");
assert.equal(process.env.VERCEL_ENV, "preview");
assert.equal(process.env.HB_HOMOLOGATION_ONLY, "true");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, url);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(key, "Missing homologation storage credential");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const revision = "10c6b1a4-7048-4a6b-a95c-90489f906c43";
const path = "99999999999996/operacional.json";
const bucket = client.storage.from("hb-cooperativa-sync");
const plan = await bridgeFrozenOperacional(client, revision);
assert.equal(plan.beforeHash, "absent", "The rehearsal destination must be empty");
try {
  const restored = await bridgeFrozenOperacional(client, revision, "absent");
  assert.equal(restored.targetHash, plan.targetHash);
  const { data, error } = await bucket.download(path);
  assert.ok(data && !error);
  const operational = JSON.parse(await data.text());
  assert.equal(operational.pagamentosCooperado[0]?.id, "fixture-pix-794");
  assert.equal(operational.pagamentosCooperado[0]?.status, "confirmado");
  assert.equal(operational.livroCaixa[0]?.id, "fixture-caixa-794");
  assert.equal(operational.livroCaixa[0]?.valor, 25);
} finally {
  const after = await bridgeFrozenOperacional(client, revision);
  if (after.beforeHash === plan.targetHash) {
    const removed = await bucket.remove([path]);
    assert.ok(!removed.error, "Could not remove the rehearsal artifact");
  }
  assert.equal((await bridgeFrozenOperacional(client, revision)).beforeHash, "absent");
}
console.log("PASS HB rollback rehearsal: frozen revision published, verified and removed from homologation Storage.");
