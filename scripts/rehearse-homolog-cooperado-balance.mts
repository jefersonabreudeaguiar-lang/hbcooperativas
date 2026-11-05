import assert from "node:assert/strict";
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { signAccessToken } from "../src/lib/security/jwt";
import { GET } from "../src/app/api/cooperado/financeiro/route";
import { fetchJefersonRebuildInicioCardFromCloud } from "../src/lib/cooperado/jefersonRebuild/server/jefersonRebuildInicioCard";

assert.equal(process.env.VERCEL_PROJECT_ID, "prj_1dqke8xRjtzsCouFEczEB4ZgmF10");
assert.equal(process.env.VERCEL_ENV, "preview");
assert.equal(process.env.HB_HOMOLOGATION_ONLY, "true");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://ocyfzramxvxqbtkorubn.supabase.co");
const cnpj = "88888888000181";
const db = getSupabaseAdmin();
assert.ok(db);
const fixture = await db.from("app_users").select("cooperativa_id,cooperado_id")
  .eq("cooperativa_cnpj", cnpj).eq("role", "cooperado").eq("active", true).single();
assert.ok(!fixture.error && fixture.data?.cooperado_id && fixture.data.cooperativa_id, "Missing synthetic cooperative member");
const { cooperativa_id: cooperativaId, cooperado_id: cooperadoId } = fixture.data;
const token = await signAccessToken({
  role: "cooperado", sub: "hb_fixture_balance_qa",
  name: "Cooperado fictício", email: "saldo-fixture@example.invalid",
  cooperativaCnpj: cnpj, cooperativaId, cooperadoId,
});
const url = "https://fixture.invalid/api/cooperado/financeiro";
assert.equal((await GET(new Request(url))).status, 401);
const response = await GET(new Request(url, { headers: { Authorization: `Bearer ${token}` } }));
assert.equal(response.status, 200, "Authenticated balance endpoint did not return a balance");
const finance = await response.json();
const card = await fetchJefersonRebuildInicioCardFromCloud(cnpj, cooperadoId, { bypassCache: true });
assert.ok(card);
assert.equal(finance.cooperadoId, card.cooperadoId);
assert.equal(finance.cooperativaId, card.cooperativaId);
assert.ok(Number.isFinite(finance.paridade.valorLiquido));
assert.equal(card.card.valor, finance.paridade.valorLiquido, "Home and financial balance differ for the same fixture");
console.log("PASS HB authenticated balance: home and financial views agree for the synthetic member.");
