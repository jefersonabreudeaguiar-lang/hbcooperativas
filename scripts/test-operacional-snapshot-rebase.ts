import assert from "node:assert/strict";
import { rebaseOperacionalSnapshot } from "../src/services/operacionalSnapshotRebase";

const collections = new Set(["livroCaixa"]);
const original = { id: "original", valor: 100 };
const debit = { id: "debito", valor: 50 };
const credit = { id: "credito", valor: 30 };
const base = { livroCaixa: [original], updatedAt: "base" };
const current = { livroCaixa: [original, credit], updatedAt: "cloud" };

assert.deepEqual(
  rebaseOperacionalSnapshot(base, { livroCaixa: [original, debit] }, current, collections),
  { ok: true, snapshot: { livroCaixa: [original, credit, debit], updatedAt: "cloud" } }
);
assert.deepEqual(
  rebaseOperacionalSnapshot(base, { livroCaixa: [] }, current, collections),
  { ok: true, snapshot: { livroCaixa: [credit], updatedAt: "cloud" } }
);
assert.deepEqual(
  rebaseOperacionalSnapshot(
    base,
    { livroCaixa: [], pagamentosCooperado: [{ id: "pagamento" }] },
    { livroCaixa: [{ ...original, valor: 90 }, credit] },
    collections
  ),
  { ok: false, conflicts: ["livroCaixa:original"] }
);
assert.deepEqual(
  rebaseOperacionalSnapshot(
    base,
    { livroCaixa: [original, debit] },
    { livroCaixa: [original, credit, credit] },
    collections
  ),
  { ok: false, conflicts: ["livroCaixa"] }
);
assert.deepEqual(
  rebaseOperacionalSnapshot(
    { operationalResetVersion: 1, livroCaixa: [original] },
    { operationalResetVersion: 1, livroCaixa: [original, debit] },
    { operationalResetVersion: 2, livroCaixa: [] },
    collections
  ),
  { ok: false, conflicts: ["operationalResetVersion"] }
);
console.log("OK: alterações independentes preservadas; conflitos e IDs duplicados recusados.");
