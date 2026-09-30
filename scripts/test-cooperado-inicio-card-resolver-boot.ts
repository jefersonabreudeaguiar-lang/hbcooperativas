/**
 * HXHÍBRIDO — boot do card início: resolverCardInicioEndurecido (ramo !data).
 * Uso: npm run test:cooperado-inicio-card-resolver-boot
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import {
  resolverCardInicioEndurecido,
  resolverInicioCardMotorFromAppData,
  type InicioCardMotorSnapshot,
} from "../src/lib/cooperadoInicioCardPolicy";
import type { InicioCardPersistido } from "../src/lib/cooperadoInicioCardPersistencia";

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";

const COOP = "coop-boot";
const COOPERADO = "c_boot";

function persistido(
  display: InicioCardMotorSnapshot,
  motorRevision = "rev-cache"
): InicioCardPersistido {
  return {
    v: 7,
    motorRevision,
    savedAt: "2026-09-28T12:00:00.000Z",
    display,
  };
}

function miniData(overrides: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Boot Test",
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
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
    ...overrides,
  } as AppData;
}

const MES = "2026-09";

const dataMotorZero = miniData({
  fichaCorrida: [
    {
      id: "f1",
      cooperativaId: COOP,
      cooperadoId: COOPERADO,
      notaPedidoId: "n1",
      mesReferencia: MES,
      valorLiquido: 123.42,
      valorBruto: 123.42,
      status: "pago",
      descricao: "x",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  notasPedido: [
    {
      id: "n1",
      cooperativaId: COOP,
      cooperadoId: COOPERADO,
      mesReferencia: MES,
      status: "pago",
      valorLiquido: 123.42,
      valorBruto: 123.42,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  pagamentosCooperado: [
    {
      id: "pg_confirmado",
      cooperativaId: COOP,
      cooperadoId: COOPERADO,
      mesReferencia: MES,
      mesesReferencia: [MES],
      valorLiquido: 123.42,
      valorBruto: 123.42,
      descontoCooperativa: 0,
      descontosExtras: [],
      fichaIds: ["f1"],
      notaPedidoIds: ["n1"],
      status: "confirmado",
      assinadoEm: "2026-09-21T14:00:00.000Z",
      assinaturaCooperado: "data:image/png;base64,x",
      pagoPor: "R",
      pagoEm: "2026-09-20T12:00:00.000Z",
      createdAt: "2026-09-21T14:00:00.000Z",
    },
  ],
});

const dataMotorPositivo = miniData({
  fichaCorrida: [
    {
      id: "f1",
      cooperativaId: COOP,
      cooperadoId: COOPERADO,
      notaPedidoId: "n1",
      mesReferencia: MES,
      valorLiquido: 123.42,
      valorBruto: 123.42,
      status: "pendente",
      descricao: "x",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  notasPedido: [
    {
      id: "n1",
      cooperativaId: COOP,
      cooperadoId: COOPERADO,
      mesReferencia: MES,
      status: "conferida",
      valorLiquido: 123.42,
      valorBruto: 123.42,
      itens: [{ produtoId: "p1", quantidade: 1, valorUnitario: 123.42, valorTotal: 123.42 }],
      percentualDescontoCooperativa: 0,
      valorDesconto: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
});

// TESTE 1 — boot cache positivo
{
  const snap = persistido({
    mesLabel: "Set/2026",
    valor: 123.42,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  });
  const result = resolverCardInicioEndurecido({
    data: null,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido: snap,
  });
  assert.equal(result.display.valor, 123.42, "boot mantém valor a receber do cache até BIC validar");
  assert.equal(result.atualizando, true);
  assert.equal(result.gravarPersistencia, false);
  assert.equal(result.latch.display.valor, 123.42);
}

// TESTE 2 — boot cache zero
{
  const snap = persistido({
    mesLabel: "—",
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  });
  const result = resolverCardInicioEndurecido({
    data: null,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido: snap,
  });
  assert.equal(result.display.valor, 0);
  assert.equal(result.gravarPersistencia, false);
}

// TESTE 3 — AppData presente, motor zero
{
  const motor = resolverInicioCardMotorFromAppData(dataMotorZero, COOPERADO, COOP);
  assert.equal(motor.valor, 0, "pré-condição: motor BIC = 0");
  const result = resolverCardInicioEndurecido({
    data: dataMotorZero,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido: null,
  });
  assert.equal(result.display.valor, 0);
}

// TESTE 4 — AppData presente, valor real
{
  const motor = resolverInicioCardMotorFromAppData(dataMotorPositivo, COOPERADO, COOP);
  assert.ok(motor.valor > 0, "pré-condição: motor BIC > 0");
  const result = resolverCardInicioEndurecido({
    data: dataMotorPositivo,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido: null,
  });
  assert.equal(result.display.valor, motor.valor);
}

// TESTE 5 — não gravar persistência no boot (subset explícito)
{
  const result = resolverCardInicioEndurecido({
    data: null,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: true,
    prevLatch: null,
    persistido: persistido({
      mesLabel: "Set",
      valor: 123.42,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    }),
  });
  assert.equal(result.gravarPersistencia, false);
}

console.log("OK — resolverCardInicioEndurecido boot (5 casos)");
