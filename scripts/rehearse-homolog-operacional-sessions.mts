import assert from "node:assert/strict";

const cnpj = "99999999999995";
assert.equal(process.env.VERCEL_PROJECT_ID, "prj_1dqke8xRjtzsCouFEczEB4ZgmF10");
assert.equal(process.env.VERCEL_ENV, "preview");
assert.equal(process.env.HB_HOMOLOGATION_ONLY, "true");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://ocyfzramxvxqbtkorubn.supabase.co");
process.env.HB_OPERACIONAL_VERSIONED_SYNC = "true";
process.env.HB_OPERACIONAL_VERSIONED_SYNC_CNPJ = cnpj;

const { getSupabaseAdmin } = await import("../src/lib/supabase/admin");
const { signAccessToken } = await import("../src/lib/security/jwt");
const { GET, POST } = await import("../src/app/api/cooperativa-sync/route");
const { isApiSecurityEnforced } = await import("../src/lib/security/env");
assert.equal(isApiSecurityEnforced(), true);
const db = getSupabaseAdmin();
assert.ok(db);
const stamp = "2026-11-04T00:00:00Z";
const base = {
  updatedAt: stamp, arquivosMensais: [], pagamentosCooperado: [], comunicados: [],
  mensalidades: [], descontos: [], fichaCorrida: [], livroCaixa: [],
  config: { descontoPadraoCooperativa: 5 }, operationalResetVersion: 1,
};
const seed = await db.rpc("hb_operacional_compare_and_save", {
  p_cnpj: cnpj, p_expected_revision: null, p_payload: base,
});
assert.ok(!seed.error && typeof seed.data === "string", "Reserved fixture already exists or could not be created");

const url = `https://fixture.invalid/api/cooperativa-sync?cnpj=${cnpj}`;
const actors = ["a", "b"];
const headers = await Promise.all(actors.map(async actor => ({
  Authorization: `Bearer ${await signAccessToken({
    sub: `hb_fixture_sync_qa_${actor}`, role: "responsavel",
    name: "Sessão fictícia", email: `sync-${actor}@example.invalid`,
    cooperativaCnpj: cnpj, cooperativaId: "hb_fixture_sync_qa", responsavelPrincipal: true,
  })}`,
  "Content-Type": "application/json",
})));
assert.equal((await GET(new Request(url))).status, 401);
const reads = await Promise.all(headers.map(async header => {
  const response = await GET(new Request(url, { headers: header }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.operacionalRevision, seed.data);
  return body;
}));
const entries = actors.map(actor => ({
  id: `hb_fixture_sync_qa_${actor}`, cooperativaId: "hb_fixture_sync_qa",
  tipo: "credito", valor: 10, data: "2026-11-04", mesReferencia: "2026-11",
  historico: "Ensaio fictício", categoria: "Teste", responsavel: actor, createdAt: stamp, updatedAt: stamp,
}));
function publish(index: number, revision: string, payload: typeof base) {
  return POST(new Request(url, {
    method: "POST", headers: headers[index],
    body: JSON.stringify({ cnpj, section: "operacional", operacionalRevision: revision, payload }),
  }));
}
const results = await Promise.all(actors.map((_actor, i) => publish(
  i, reads[i].operacionalRevision, { ...reads[i].operacional, livroCaixa: [entries[i]] }
)));
assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
const rejected = results.findIndex(r => r.status === 409);
assert.equal((await results[rejected].json()).code, "OPERACIONAL_CONFLICT");
const refreshed = await GET(new Request(url, { headers: headers[rejected] }));
assert.equal(refreshed.status, 200);
const current = await refreshed.json();
assert.equal(current.operacional.livroCaixa.length, 1);
const retry = await publish(rejected, current.operacionalRevision, {
  ...current.operacional, livroCaixa: [...current.operacional.livroCaixa, entries[rejected]],
});
assert.equal(retry.status, 201);
const final = await GET(new Request(url, { headers: headers[0] }));
assert.equal(final.status, 200);
const data = await final.json();
assert.deepEqual(data.operacional.livroCaixa.map((line: { id: string }) => line.id).sort(), entries.map(line => line.id).sort());
console.log("PASS HB authenticated sync: two signed sessions shared a baseline; stale write refused; retry preserved both entries.");
