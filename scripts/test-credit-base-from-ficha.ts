/**
 * Regressão: crédito Conta Coop sincronizado com entregas pendentes; zera após pagamento.
 * Uso: npx tsx scripts/test-credit-base-from-ficha.ts
 */
import assert from "node:assert/strict";
import {
  getCreditoBaseContaCoopReais,
  getCreditoBaseCooperadoCents,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { getTotalAPagarCooperado, registrarPagamentoCooperado } from "../src/services/notaPedidoService.ts";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";

const COOP = "coop-1";
const COOPERADO = "c_coop";

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Teste", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado Teste",
        cpf: "00000000000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", nome: "Inst", cooperativaId: COOP, ativo: true, createdAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
    ...overrides,
  } as AppData;
}

function ficha(status: FichaCorrida["status"], valorLiquido = 100): FichaCorrida {
  return {
    id: `fc_${Math.random().toString(36).slice(2, 7)}`,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: "n1",
    mesReferencia: "2026-08",
    status,
    valorBruto: valorLiquido,
    descontos: 0,
    valorLiquido,
    descricao: "Nota teste",
    saldoAcumulado: valorLiquido,
    dataLancamento: "2026-08-15",
    dataPagamentoPrevista: "2026-08-31",
    responsavelConferencia: "Teste",
    itens: [],
    percentualDescontoCooperativa: 0,
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

function nota(status: NotaPedido["status"]): NotaPedido {
  return {
    id: "n1",
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: "2026-08",
    status,
    valorLiquido: 100,
    valorBruto: 100,
    valorDesconto: 0,
    percentualDescontoCooperativa: 0,
    instituicaoId: "inst-1",
    itens: [{ produtoInstituicaoId: "p1", produtoNome: "Prod", quantidade: 1, precoUnitario: 100, valorBruto: 100, unidade: "un" }],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

{
  const pendente = baseData({
    notasPedido: [nota("conferida")],
    fichaCorrida: [ficha("pendente", 100)],
  });
  assert.equal(getTotalAPagarCooperado(pendente, COOPERADO, undefined, COOP), 100);
  assert.equal(getCreditoBaseContaCoopReais(pendente, COOPERADO, COOP), 100);
  assert.equal(getCreditoBaseCooperadoCents(pendente, COOPERADO, COOP), 10000);
  console.log("ok crédito base com ficha pendente");
}

{
  const pago = baseData({
    notasPedido: [nota("pago")],
    fichaCorrida: [ficha("pago", 100)],
  });
  assert.equal(getTotalAPagarCooperado(pago, COOPERADO, undefined, COOP), 0, "a pagar zera após pagamento");
  assert.equal(
    getCreditoBaseContaCoopReais(pago, COOPERADO, COOP),
    0,
    "crédito Conta Coop zera após pagamento ao cooperado"
  );
  console.log("ok crédito base zera após pagamento");
}

{
  let data = baseData({
    notasPedido: [nota("conferida")],
    fichaCorrida: [ficha("pendente", 100)],
  });
  data = registrarPagamentoCooperado(data, COOPERADO, "2026-08", "Tesoureiro");
  assert.equal(getTotalAPagarCooperado(data, COOPERADO, undefined, COOP), 0);
  assert.equal(getCreditoBaseContaCoopReais(data, COOPERADO, COOP), 0);
  console.log("ok fluxo registrar pagamento zera crédito Conta Coop");
}

{
  const duasEntregas = baseData({
    notasPedido: [nota("conferida"), { ...nota("conferida"), id: "n2", valorLiquido: 50, valorBruto: 50 }],
    fichaCorrida: [ficha("pendente", 100), { ...ficha("pendente", 50), id: "fc2", notaPedidoId: "n2" }],
  });
  assert.equal(getCreditoBaseContaCoopReais(duasEntregas, COOPERADO, COOP), 150);
  console.log("ok crédito base soma entregas pendentes");
}

console.log("\nTodos os testes de creditBaseFromFicha passaram.");
