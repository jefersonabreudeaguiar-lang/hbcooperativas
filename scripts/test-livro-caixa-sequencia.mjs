/**
 * Livro caixa — numeração sequencial por evento
 * npx tsx scripts/test-livro-caixa-sequencia.mjs
 */
import assert from "node:assert/strict";
import {
  criarLancamentoManual,
  findLancamentosPorSequencia,
  lancarPagamentoCooperadoNoCaixa,
  parseNumeroSequenciaInput,
} from "../src/services/livroCaixaService.ts";

const coopId = "coop_test";
const base = {
  cooperados: [{ id: "c1", cooperativaId: coopId, nomeCompleto: "Ana" }],
  livroCaixa: [],
  pagamentosCooperado: [],
};

assert.equal(parseNumeroSequenciaInput("010"), 10);

let d = criarLancamentoManual(base, coopId, "credito", 100, "Teste avulso");
assert.equal(d.livroCaixa[0].numeroSequencia, 1);

const pg = {
  id: "pg_999",
  cooperativaId: coopId,
  cooperadoId: "c1",
  mesReferencia: "2026-03",
  valorBruto: 100,
  descontoCooperativa: 5,
  descontosExtras: [],
  valorLiquido: 95,
  fichaIds: [],
  notaPedidoIds: [],
  status: "aguardando_confirmacao",
  pagoPor: "Dir",
  pagoEm: "2026-03-15T12:00:00.000Z",
  createdAt: "2026-03-15T12:00:00.000Z",
  updatedAt: "2026-03-15T12:00:00.000Z",
};

d = lancarPagamentoCooperadoNoCaixa(d, pg);
const linhasPg = d.livroCaixa.filter((l) => l.grupoEventoId === "evt_pg_pg_999");
assert.ok(linhasPg.length >= 1);
assert.ok(linhasPg.every((l) => l.numeroSequencia === 2));

const ano = d.livroCaixaControleAnual?.[0]?.anoLivro ?? new Date().getFullYear();
const found = findLancamentosPorSequencia(d, coopId, 2, ano);
assert.ok(found.length >= 1);

console.log("OK: livro caixa sequencia");
