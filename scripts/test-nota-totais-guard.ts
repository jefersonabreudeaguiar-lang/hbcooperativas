import assert from "node:assert/strict";
import type { NotaPedido } from "../src/types";
import {
  calcularItensNota,
  normalizarTotaisNotaDesdeItens,
  notaTotaisCoerentesComItens,
} from "../src/services/notaPedidoService";

const base: NotaPedido = {
  id: "np_test",
  cooperativaId: "coop",
  cooperadoId: "c1",
  instituicaoId: "i1",
  mesReferencia: "2026-09",
  status: "conferida",
  itens: [
    {
      produtoInstituicaoId: "p1",
      produtoNome: "Arroz",
      unidade: "kg",
      quantidade: 10,
      precoUnitario: 5.5,
      valorBruto: 55,
    },
  ],
  valorBruto: 55,
  valorDesconto: 2.75,
  valorLiquido: 52.25,
  percentualDescontoCooperativa: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

{
  const calc = calcularItensNota(base.itens, 5);
  const drift: NotaPedido = { ...base, valorLiquido: calc.valorLiquido + 0.05 };
  assert.equal(notaTotaisCoerentesComItens(drift), false);
  const fixed = normalizarTotaisNotaDesdeItens(drift);
  assert.equal(fixed.valorLiquido, calc.valorLiquido);
  assert.equal(notaTotaisCoerentesComItens(fixed), true);
}

console.log("test-nota-totais-guard: ok");
