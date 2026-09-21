/**
 * HB Créditos — base alinhada ao valor a receber + anti crédito falso no servidor.
 * npx tsx scripts/test-hb-credit-base-alignment.ts
 */
import assert from "node:assert/strict";
import { clampCreditosBaseToAuthoritative } from "../src/modules/hb-credit/engine/creditBaseValidation.ts";
import { getCreditoBaseContaCoopReais } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { registrarPagamentoCooperado } from "../src/services/notaPedidoService.ts";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";

const COOP = "coop-1";
const COOPERADO = "c_test";

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Teste", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Teste HB",
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
    config: {},
    ...overrides,
  } as AppData;
}

function ficha(id: string, notaId: string): FichaCorrida {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: notaId,
    mesReferencia: "2026-09",
    status: "pendente",
    valorBruto: 200,
    descontos: 0,
    valorLiquido: 200,
    descricao: "Entrega",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function nota(id: string): NotaPedido {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: "2026-09",
    status: "conferida",
    valorLiquido: 200,
    valorBruto: 200,
    instituicaoId: "inst-1",
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 200 }],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

{
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1")],
  });
  assert.equal(getCreditoBaseContaCoopReais(data, COOPERADO, COOP), 200);
  data = registrarPagamentoCooperado(data, COOPERADO, "2026-09", "Resp");
  assert.equal(
    getCreditoBaseContaCoopReais(data, COOPERADO, COOP),
    0,
    "Após PIX aguardando assinatura, crédito base HB deve zerar"
  );
}

{
  const { sanitized, clamped } = clampCreditosBaseToAuthoritative(
    { c_a: 50_000, c_b: 10_000 },
    { c_a: 20_000, c_b: 15_000 },
    ["c_a", "c_b"]
  );
  assert.equal(sanitized.c_a, 20_000);
  assert.equal(sanitized.c_b, 10_000);
  assert.deepEqual(clamped, ["c_a"]);
}

console.log("OK — HB crédito base alinhada e clamp servidor");
