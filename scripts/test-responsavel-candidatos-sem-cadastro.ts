/**
 * Candidatos Pagar/Em aberto com cooperados[] vazio (só ficha/nota).
 * npx tsx scripts/test-responsavel-candidatos-sem-cadastro.ts
 */
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { totalValoresAPagarGestaoUnificado } from "../src/lib/responsavel/responsavelGestaoTotais.ts";

const COOP = "coop-x";
const data = {
  ...emptyInitialData,
  cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" } as never],
  cooperados: [],
  notasPedido: [],
  fichaCorrida: [
    {
      id: "f1",
      cooperadoId: "c_ext",
      cooperativaId: COOP,
      mesReferencia: "2026-10",
      status: "pendente",
      valorBruto: 50,
      valorLiquido: 45,
      descontos: 5,
      cooperadoNomeSnapshot: "Externo Ficha",
      createdAt: "2026-10-01T00:00:00.000Z",
    } as never,
  ],
  pagamentosCooperado: [],
} as typeof emptyInitialData;

resetResponsavelPainelIndexCache();
const linhas = getRelatorioLancamentosEmAbertoResponsavel(data, COOP);
assert.equal(linhas.length, 1, "Em aberto lista cooperado só da ficha");
assert.equal(linhas[0].total, 45);
const total = totalValoresAPagarGestaoUnificado(data, COOP);
assert.equal(total, 45, "Início/relatório = soma Em aberto");

console.log("OK test-responsavel-candidatos-sem-cadastro");
