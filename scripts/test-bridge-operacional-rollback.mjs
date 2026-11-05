import assert from "node:assert/strict";
import { bridgeFrozenOperacional } from "./bridge-operacional-rollback.mjs";

const revision = "00000000-0000-4000-8000-000000000001";
const payload = {
  updatedAt: "2026-11-04T00:00:00Z",
  arquivosMensais: [],
  pagamentosCooperado: [{ id: "pix-confirmado", status: "confirmado" }],
  comunicados: [],
  mensalidades: [],
  descontos: [],
  config: { descontoPadraoCooperativa: 5 },
  livroCaixa: [{ id: "novo-lancamento", valor: 25 }],
};
const row = { revision, writes_frozen: false, payload };
let legacy = null;
let writes = 0;
let ignoreUpload = false;
const client = {
  from: (table) => {
    assert.equal(table, "hb_operacional_snapshots");
    return { select: () => ({ eq: (field, cnpj) => {
      assert.equal(field, "cooperativa_cnpj");
      assert.equal(cnpj, "99999999999996");
      return { maybeSingle: async () => ({ data: row }) };
    } }) };
  },
  storage: { from: () => ({
    list: async () => ({ data: legacy === null ? [] : [{ name: "operacional.json" }] }),
    download: async () => legacy === null
      ? { error: { statusCode: "404" } }
      : { data: new Blob([legacy]) },
    upload: async (path, bytes, options) => {
      assert.equal(path, "99999999999996/operacional.json");
      assert.equal(options.upsert, legacy !== null);
      writes++;
      if (!ignoreUpload) legacy = bytes;
      return { error: null };
    },
  }) },
};

await assert.rejects(bridgeFrozenOperacional(client, revision), /congelada/);
row.writes_frozen = true;
const plan = await bridgeFrozenOperacional(client, revision);
assert.equal(plan.beforeHash, "absent");
assert.equal(plan.applied, false);
await assert.rejects(bridgeFrozenOperacional(client, revision, "stale-hash"), /legado mudou/);
assert.equal(writes, 0);
const result = await bridgeFrozenOperacional(client, revision, plan.beforeHash);
assert.equal(result.targetHash, plan.targetHash);
assert.deepEqual(JSON.parse(legacy.toString()), payload);
assert.equal(writes, 1);
await bridgeFrozenOperacional(client, revision, result.targetHash);
assert.equal(writes, 1, "A tentativa repetida não regrava a mesma cópia.");
legacy = Buffer.from("{}");
const changed = await bridgeFrozenOperacional(client, revision);
ignoreUpload = true;
await assert.rejects(bridgeFrozenOperacional(client, revision, changed.beforeHash), /releitura.*diverge/);
console.log("PASS: exporta somente a revisão congelada, exige a cópia esperada e confirma o conteúdo no formato legado.");
