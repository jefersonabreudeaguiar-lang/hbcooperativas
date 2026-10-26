/**
 * Painel × relatório × soma cooperado — mesma SSOT (getTotalAPagarCooperado).
 * npx tsx scripts/test-responsavel-paridade-totais-a-pagar.ts
 */
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data.ts";
import { getTotalAPagarCooperado } from "../src/services/notaPedidoService.ts";
import { getRelatorioPagarCooperadoEmAberto, getTotalValoresAPagarEmAberto } from "../src/services/relatorioService.ts";
import { totalValoresAPagarGestaoUnificado } from "../src/lib/responsavel/responsavelGestaoTotais.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { round2 } from "../src/utils/calculations.ts";

const COOP = "coop-paridade";
const COOP2 = "coop-pix";

function fixtureFichaPendente() {
  return {
    ...emptyInitialData,
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" } as never],
    cooperados: [
      {
        id: "c1",
        nomeCompleto: "Um",
        cooperativaId: COOP,
        status: "ativo",
      } as never,
    ],
    notasPedido: [
      {
        id: "n1",
        cooperadoId: "c1",
        cooperativaId: COOP,
        mesReferencia: "2026-10",
        status: "conferida",
        valorBruto: 100,
        valorLiquido: 100,
        instituicaoId: "i1",
        itens: [{ produtoId: "p", quantidade: 1, precoUnitario: 100 }],
        createdAt: "2026-10-01T00:00:00.000Z",
      } as never,
    ],
    fichaCorrida: [
      {
        id: "f1",
        cooperadoId: "c1",
        cooperativaId: COOP,
        notaPedidoId: "n1",
        mesReferencia: "2026-10",
        status: "pendente",
        valorBruto: 100,
        valorLiquido: 100,
        descontos: 0,
        createdAt: "2026-10-01T00:00:00.000Z",
      } as never,
    ],
    pagamentosCooperado: [],
  } as typeof emptyInitialData;
}

function fixtureNotaSemPixAposConfirmado() {
  return {
    ...emptyInitialData,
    cooperativas: [{ id: COOP2, nome: "Coop2", cnpj: "00000000000192", status: "ativa" } as never],
    cooperados: [
      {
        id: "c2",
        nomeCompleto: "Dois",
        cooperativaId: COOP2,
        status: "ativo",
      } as never,
    ],
    notasPedido: [
      {
        id: "n2",
        cooperadoId: "c2",
        cooperativaId: COOP2,
        mesReferencia: "2026-09",
        status: "conferida",
        valorBruto: 2000,
        valorLiquido: 2000,
        instituicaoId: "i1",
        itens: [{ produtoId: "p", quantidade: 1, precoUnitario: 2000 }],
        createdAt: "2026-09-01T00:00:00.000Z",
      } as never,
    ],
    fichaCorrida: [
      {
        id: "f2",
        cooperadoId: "c2",
        cooperativaId: COOP2,
        notaPedidoId: "n2",
        mesReferencia: "2026-09",
        status: "pago",
        valorBruto: 2000,
        valorLiquido: 2000,
        descontos: 0,
        createdAt: "2026-09-01T00:00:00.000Z",
      } as never,
    ],
    pagamentosCooperado: [
      {
        id: "pix1",
        cooperadoId: "c2",
        cooperativaId: COOP2,
        status: "confirmado",
        valorLiquido: 2000,
        mesReferencia: "2026-09",
        fichaIds: ["f2"],
        notaPedidoIds: ["n2"],
        createdAt: "2026-09-15T00:00:00.000Z",
      } as never,
    ],
  } as typeof emptyInitialData;
}

function assertParidade(data: typeof emptyInitialData, coopId: string) {
  resetResponsavelPainelIndexCache();
  const soma = round2(
    data.cooperados
      .filter((c) => c.cooperativaId === coopId && c.status === "ativo")
      .reduce((s, c) => s + getTotalAPagarCooperado(data, c.id, undefined, coopId), 0)
  );
  const painel = totalValoresAPagarGestaoUnificado(data, coopId);
  const rel = getTotalValoresAPagarEmAberto(data, coopId);
  const linhas = getRelatorioPagarCooperadoEmAberto(data, coopId);
  const somaLinhas = round2(linhas.reduce((s, l) => s + l.total, 0));
  const emAberto = getRelatorioLancamentosEmAbertoResponsavel(data, coopId);
  const somaEmAberto = round2(emAberto.reduce((s, l) => s + l.total, 0));
  assert.equal(painel, soma, "painel = soma cooperado");
  assert.equal(rel, soma, "relatório total = soma cooperado");
  assert.equal(somaLinhas, soma, "linhas relatório = soma cooperado");
  assert.equal(somaEmAberto, soma, "Em aberto responsável = soma cooperado");
}

assertParidade(fixtureFichaPendente(), COOP);
assertParidade(fixtureNotaSemPixAposConfirmado(), COOP2);
assert.equal(getTotalAPagarCooperado(fixtureNotaSemPixAposConfirmado(), "c2", undefined, COOP2), 0);

console.log("OK test-responsavel-paridade-totais-a-pagar");
