/**
 * H203 — apresentação consolidada (read-only, in-memory).
 * npx tsx scripts/test-h203-apresentacao-consolidada.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types/index.ts";
import {
  cooperadoApresentacaoFinanceiraConsolidada,
  cooperadoCarregandoValoresFinanceiros,
  cooperadoInicioParaCardsDefinitivos,
} from "../src/lib/cooperadoApresentacaoFinanceira.ts";
import { getInicioCooperadoParaExibicao } from "../src/services/bicProjecaoFinanceiraCooperado.ts";
import {
  getPagamentoAguardandoCooperado,
  getTotalAPagarCooperado,
} from "../src/services/notaPedidoService.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";

const COOP = "coop-h203";
const ORLANDO = "c_1782263929381_ncp55";
const JEFERSON = "c_1781981564381_w67gg";
const OUTRO = "c_outro_h203";
const MES = "2026-09";

function snap(data: AppData) {
  return JSON.stringify({ n: data.notasPedido, f: data.fichaCorrida, p: data.pagamentosCooperado });
}

function base(overrides: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: ORLANDO,
        cooperativaId: COOP,
        nomeCompleto: "Orlando",
        cpfCnpj: "1",
        telefone: "",
        endereco: "",
        comunidade: "",
        chavePix: "x",
        pixValido: true,
        ativo: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: JEFERSON,
        cooperativaId: COOP,
        nomeCompleto: "Jeferson",
        cpfCnpj: "2",
        telefone: "",
        endereco: "",
        comunidade: "",
        chavePix: "y",
        pixValido: true,
        ativo: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: OUTRO,
        cooperativaId: COOP,
        nomeCompleto: "Outro",
        cpfCnpj: "3",
        telefone: "",
        endereco: "",
        comunidade: "",
        chavePix: "z",
        pixValido: true,
        ativo: true,
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    descontos: [],
    comunicados: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
    ...overrides,
  } as AppData;
}

// Gate cooperado
assert.equal(
  cooperadoApresentacaoFinanceiraConsolidada({
    role: "cooperado",
    syncing: false,
    cooperadoPagamentosHydrated: true,
  }),
  true
);
assert.equal(
  cooperadoCarregandoValoresFinanceiros({
    role: "cooperado",
    syncing: true,
    cooperadoPagamentosHydrated: true,
  }),
  true
);
assert.equal(
  cooperadoApresentacaoFinanceiraConsolidada({
    role: "responsavel",
    syncing: true,
    cooperadoPagamentosHydrated: false,
  }),
  true
);

const orlandoData = base({
  notasPedido: [
    {
      id: "np_old",
      cooperativaId: COOP,
      cooperadoId: ORLANDO,
      instituicaoId: "i",
      numeroNota: "1",
      dataEntrega: MES,
      localEntrega: "L",
      itens: [],
      valorBruto: 233,
      percentualDescontoCooperativa: 0,
      valorDesconto: 0,
      valorLiquido: 233,
      status: "pago",
      mesReferencia: MES,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "np_new",
      cooperativaId: COOP,
      cooperadoId: ORLANDO,
      instituicaoId: "i",
      numeroNota: "2",
      dataEntrega: MES,
      localEntrega: "L",
      itens: [],
      valorBruto: 237.6,
      percentualDescontoCooperativa: 0,
      valorDesconto: 11.88,
      valorLiquido: 225.72,
      status: "conferida",
      mesReferencia: MES,
      createdAt: "",
      updatedAt: "",
    },
  ],
  fichaCorrida: [
    {
      id: "fc_old",
      cooperativaId: COOP,
      cooperadoId: ORLANDO,
      notaPedidoId: "np_old",
      descricao: "",
      valorBruto: 233,
      descontos: 0,
      valorLiquido: 233,
      saldoAcumulado: 0,
      mesReferencia: MES,
      status: "pago",
      dataLancamento: MES,
      createdAt: "",
    },
    {
      id: "fc_new",
      cooperativaId: COOP,
      cooperadoId: ORLANDO,
      notaPedidoId: "np_new",
      descricao: "",
      valorBruto: 237.6,
      descontos: 11.88,
      valorLiquido: 225.72,
      saldoAcumulado: 0,
      mesReferencia: MES,
      status: "pendente",
      dataLancamento: MES,
      createdAt: "",
    },
  ],
  pagamentosCooperado: [
    {
      id: "pg_1790308339483",
      cooperativaId: COOP,
      cooperadoId: ORLANDO,
      mesReferencia: MES,
      mesesReferencia: [MES],
      valorBruto: 245.6,
      descontoCooperativa: 12.28,
      descontosExtras: [],
      valorLiquido: 123.42,
      fichaIds: ["fc_old"],
      notaPedidoIds: ["np_old"],
      status: "aguardando_confirmacao",
      pagoPor: "R",
      pagoEm: MES,
      createdAt: MES,
    },
  ],
});

const before = snap(orlandoData);
const bruto = getValorQuantoVouReceber(orlandoData, ORLANDO, COOP);
assert.equal(bruto.valor, 225.72);
const mascarado = getInicioCooperadoParaExibicao(orlandoData, ORLANDO, COOP, {
  apresentacaoConsolidada: false,
}).value;
assert.equal(mascarado.exibir, false);
assert.equal(mascarado.valor, 0);
const consolidado = getInicioCooperadoParaExibicao(orlandoData, ORLANDO, COOP, {
  apresentacaoConsolidada: true,
}).value;
assert.ok(consolidado.exibir);
assert.equal(consolidado.valor, 225.72);
assert.equal(getPagamentoAguardandoCooperado(orlandoData, ORLANDO, MES), undefined);
assert.equal(orlandoData.pagamentosCooperado[0]!.valorLiquido, 123.42);
assert.equal(snap(orlandoData), before);

// Jeferson — mesmo motor
const jData = base({
  notasPedido: [
    {
      id: "nj",
      cooperativaId: COOP,
      cooperadoId: JEFERSON,
      instituicaoId: "i",
      numeroNota: "1",
      dataEntrega: MES,
      localEntrega: "L",
      itens: [],
      valorBruto: 50,
      percentualDescontoCooperativa: 0,
      valorDesconto: 0,
      valorLiquido: 50,
      status: "conferida",
      mesReferencia: MES,
      createdAt: "",
      updatedAt: "",
    },
  ],
  fichaCorrida: [
    {
      id: "fj",
      cooperativaId: COOP,
      cooperadoId: JEFERSON,
      notaPedidoId: "nj",
      descricao: "",
      valorBruto: 50,
      descontos: 0,
      valorLiquido: 50,
      saldoAcumulado: 0,
      mesReferencia: MES,
      status: "pendente",
      dataLancamento: MES,
      createdAt: "",
    },
  ],
});

const mix = base({
  notasPedido: [...orlandoData.notasPedido, ...jData.notasPedido],
  fichaCorrida: [...orlandoData.fichaCorrida, ...jData.fichaCorrida],
  pagamentosCooperado: [...orlandoData.pagamentosCooperado],
});
assert.equal(getValorQuantoVouReceber(mix, JEFERSON, COOP).valor, 50);
assert.equal(getValorQuantoVouReceber(mix, ORLANDO, COOP).valor, 225.72);

const det1 = getInicioCooperadoParaExibicao(jData, JEFERSON, COOP).value;
const det2 = getInicioCooperadoParaExibicao(jData, JEFERSON, COOP).value;
assert.equal(JSON.stringify(det1), JSON.stringify(det2));

assert.equal(
  cooperadoInicioParaCardsDefinitivos(
    { exibir: true, mes: MES, meses: [MES], mesLabel: "X", valor: 99, valorRecibo: 0, aguardandoAssinatura: false },
    false
  ).valor,
  0
);

console.log("H203 apresentação consolidada: OK");
