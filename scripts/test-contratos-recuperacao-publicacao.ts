import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import { publicacaoContratosApagariaItens } from "../src/services/contratosPublicacaoGuard";
import { mergeContratosIntoData } from "../src/services/cooperativaSyncCloudService";
import { getTodosProdutosCatalogo } from "../src/services/catalogoContratosService";
import { alinharCatalogoSnapshotStaff } from "../src/lib/staff/staffGestaoPainelLeitura";
import { getContratosEntrega } from "../src/utils/contratosEntrega";
import { registrarCatalogoCloudLeitura, aplicarCatalogoCloudLeitura, invalidarCatalogoCloudLeitura } from "../src/lib/staff/staffCatalogoCloudLeitura";
import type { ContratosSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";

const restored: ContratosSyncPayload = {
  updatedAt: "2026-11-01T15:32:00Z",
  instituicoes: [{ id: "original", cooperativaId: "coop", nome: "PNAE", updatedAt: "2026-11-01T15:32:00Z" } as never],
  produtosInstituicao: [{ id: "abobora", cooperativaId: "coop", instituicaoId: "original", nome: "ABÓBORA", precoUnitario: 5.71, ativo: true, updatedAt: "2026-11-01T15:32:00Z" } as never],
  instituicoesExcluidas: [{ id: "vazio", cooperativaId: "coop", deletedAt: "2026-11-01T15:32:00Z" }],
};
assert.equal(publicacaoContratosApagariaItens(restored, { ...restored, produtosInstituicao: [] }), true);
assert.equal(publicacaoContratosApagariaItens(null, { ...restored, produtosInstituicao: [] }), false);
assert.equal(publicacaoContratosApagariaItens(restored, restored), false);
assert.equal(publicacaoContratosApagariaItens(restored, { ...restored, produtosInstituicao: [], instituicoesExcluidas: [{ id: "original", cooperativaId: "coop", deletedAt: restored.updatedAt }] }), false);
const data = {
  ...emptyInitialData,
  instituicoes: [{ id: "vazio", cooperativaId: "coop", nome: "PNAE" } as never],
  produtosInstituicao: [],
  instituicoesExcluidas: [{ id: "original", cooperativaId: "coop", deletedAt: "2026-10-26T00:00:00Z" }],
};
const before = JSON.stringify(data);
const merged = mergeContratosIntoData(data, restored, "coop");
assert.equal(getTodosProdutosCatalogo(merged, "coop")[0]?.precoUnitario, 5.71);
assert.equal(getTodosProdutosCatalogo(merged, "outra-coop").length, 0);
assert.equal(merged.instituicoes.some((i) => i.id === "vazio"), false);
assert.equal(JSON.stringify(data), before);
assert.equal(merged.fichaCorrida, data.fichaCorrida);
assert.equal(merged.pagamentosCooperado, data.pagamentosCooperado);
const newerDeletion = { ...data, instituicoesExcluidas: [{ id: "original", cooperativaId: "coop", deletedAt: "2026-11-02T00:00:00Z" }] };
const republicado = { ...restored, updatedAt: "2026-11-03T00:00:00Z" };
assert.equal(getTodosProdutosCatalogo(mergeContratosIntoData(newerDeletion, republicado, "coop"), "coop").length, 1, "republicação supera exclusão antiga mesmo preservando a data original do cadastro");
assert.equal(getTodosProdutosCatalogo(mergeContratosIntoData(newerDeletion, restored, "coop"), "coop").length, 0);
const leituraStaff = alinharCatalogoSnapshotStaff(data, merged);
registrarCatalogoCloudLeitura("coop", restored);
const leituraPublicada = aplicarCatalogoCloudLeitura(newerDeletion);
assert.equal(getContratosEntrega(leituraPublicada, "coop").length, 1, "resposta confirmada da nuvem chega ao formulário mesmo com persist antigo");
assert.equal(leituraPublicada.fichaCorrida, newerDeletion.fichaCorrida);
assert.equal(leituraPublicada.pagamentosCooperado, newerDeletion.pagamentosCooperado);
invalidarCatalogoCloudLeitura("coop");
assert.equal(aplicarCatalogoCloudLeitura(newerDeletion), newerDeletion);
assert.equal(getContratosEntrega(leituraStaff, "coop").length, 1, "lastro financeiro antigo não esconde o contrato publicado");
assert.equal(getTodosProdutosCatalogo(leituraStaff, "coop")[0]?.precoUnitario, 5.71);
assert.equal(leituraStaff.fichaCorrida, data.fichaCorrida);
assert.equal(leituraStaff.pagamentosCooperado, data.pagamentosCooperado);
assert.equal(leituraStaff.livroCaixa, data.livroCaixa);
const excluido = alinharCatalogoSnapshotStaff(merged, { ...merged, instituicoes: [], produtosInstituicao: [], instituicoesExcluidas: [{ id: "original", cooperativaId: "coop", deletedAt: "2026-11-02T00:00:00Z" }] });
assert.equal(getContratosEntrega(excluido, "coop").length, 0, "catálogo antigo não ressuscita contrato excluído");
console.log("OK: recuperação do contrato, proteção de publicação vazia, exclusão posterior, escopo e financeiro preservados.");
