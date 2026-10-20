/**
 * Aba Preços do cooperado: catálogo com preço não some no PWA mensageiro.
 * npx tsx scripts/test-cooperado-precos-catalogo-pwa.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  buildCooperadoPwaPrecosCatalogoView,
  lerCooperadoPrecosCatalogoLeitura,
} from "../src/lib/cooperado/cooperadoPwaPrecosCatalogoSnapshot.ts";

const coopId = "coop-casa";
const comPrecos = {
  ...emptyInitialData,
  cooperativas: [{ id: coopId, nome: "CoopeagriPla", cnpj: "62351750000165", status: "ativa" } as never],
  instituicoes: [{ id: "i1", cooperativaId: coopId, nome: "PNAE", tipo: "PNAE" } as never],
  produtosInstituicao: [
    {
      id: "pi1",
      cooperativaId: coopId,
      instituicaoId: "i1",
      nome: "Alface",
      unidade: "kg",
      precoUnitario: 4.5,
      ativo: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    } as never,
  ],
};

const view = buildCooperadoPwaPrecosCatalogoView(comPrecos, coopId);
assert.equal(view.itens.length, 1, "catálogo com preço entra na aba Preços");
assert.equal(view.itens[0].nome, "Alface");
assert.equal(view.itens[0].precoUnitario, 4.5);
assert.equal(view.instituicoes[0]?.nome, "PNAE");

const vazio = buildCooperadoPwaPrecosCatalogoView(
  { ...comPrecos, produtosInstituicao: [] },
  coopId
);
assert.equal(vazio.itens.length, 0, "sem item publicado não inventa preço");

const outraCoop = buildCooperadoPwaPrecosCatalogoView(comPrecos, "coop-outra");
assert.equal(outraCoop.itens.length, 0, "preço de outra cooperativa não vaza");

assert.deepEqual(lerCooperadoPrecosCatalogoLeitura(undefined), { instituicoes: [], itens: [] });

const precosPage = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/app/(app)/precos/PrecosContent.tsx"),
  "utf8"
);
assert.match(precosPage, /lerCooperadoPrecosCatalogoLeitura/);
assert.match(precosPage, /messengerCatalogo/);
assert.match(precosPage, /persistirCooperadoPwaPrecosCatalogoSnapshotFromUser/);
assert.match(precosPage, /isCooperadoPwaMessengerMode/);

const messenger = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoPwaMessengerMode.ts"),
  "utf8"
);
assert.match(messenger, /persistirCooperadoPwaPrecosCatalogoSnapshotFromUser/);

const policy = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/cooperado/cooperadoPwaSnapshotBuildPolicy.ts"),
  "utf8"
);
assert.match(policy, /hb\.coop\.pwaPrecosCatalogo/);

console.log("ok: aba Preços do cooperado lê o catálogo mesmo no PWA mensageiro");
