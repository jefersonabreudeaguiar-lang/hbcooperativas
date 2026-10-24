/**
 * Gestão sem data.cooperados: nomes e A pagar vêm da ficha/nota/PIX.
 * npx tsx scripts/test-responsavel-cooperados-ficha-sem-cadastro.ts
 */
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  getCooperadoNomeResolvido,
  listCooperadosDaCooperativa,
  resolverNomeCooperadoGestao,
} from "../src/services/cooperadoCloudService.ts";
import { getTotalValoresAPagarGestaoCooperativa } from "../src/lib/responsavel/responsavelGestaoLeitura.ts";
import { getRelatorioPagarCooperadoEmAberto } from "../src/services/relatorioService.ts";
import { staffCooperadosCadastroAusente } from "../src/lib/staff/staffOperacionalColdHydrate.ts";

const COOP = "coop-sem-cadastro";
const MES = "2026-10";

const data = {
  ...emptyInitialData,
  cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" } as never],
  cooperados: [],
  notasPedido: [
    {
      id: "n1",
      cooperadoId: "c_ivan",
      cooperativaId: COOP,
      mesReferencia: MES,
      status: "conferida",
      valorBruto: 200,
      valorLiquido: 190,
      cooperadoNomeSnapshot: "Ivan Oliveira",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    } as never,
  ],
  fichaCorrida: [
    {
      id: "f1",
      cooperadoId: "c_ivan",
      cooperativaId: COOP,
      mesReferencia: MES,
      notaPedidoId: "n1",
      status: "pendente",
      valorBruto: 200,
      valorLiquido: 190,
      descontos: 10,
      cooperadoNomeSnapshot: "Ivan Oliveira",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    } as never,
  ],
  pagamentosCooperado: [],
} as typeof emptyInitialData;

assert.equal(staffCooperadosCadastroAusente(data, COOP), true);
assert.equal(resolverNomeCooperadoGestao(data, "c_ivan", COOP), "Ivan Oliveira");
assert.equal(getCooperadoNomeResolvido(data, "c_ivan", COOP), "Ivan Oliveira");

const lista = listCooperadosDaCooperativa(data, COOP);
assert.equal(lista.length, 1);
assert.equal(lista[0].nomeCompleto, "Ivan Oliveira");
assert.notEqual(lista[0].nomeCompleto, "Cooperado");

const total = getTotalValoresAPagarGestaoCooperativa(data, COOP);
assert.ok(total > 0, "A pagar não zera sem cadastro local");

const linhas = getRelatorioPagarCooperadoEmAberto(data, COOP);
assert.equal(linhas.length, 1);
assert.equal(linhas[0].cooperado, "Ivan Oliveira");

console.log("OK test-responsavel-cooperados-ficha-sem-cadastro");
