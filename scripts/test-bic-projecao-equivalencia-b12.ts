/**
 * BIC B1.2 — prova de equivalência: fachada vs motores diretos (in-memory only).
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  cooperadoExibirValorReceberInicio,
  getResumoQuantoVouReceberCooperado,
  getValorQuantoVouReceber,
} from "../src/services/cooperadoEntregasService.ts";
import { getProjecaoFinanceiraCooperadoBIC } from "../src/services/bicProjecaoFinanceiraCooperado.ts";
import { registrarPagamentoCooperado } from "../src/services/notaPedidoService.ts";

const COOP = "coop1";
const COOPERADO = "c_orlando";

function baseData(partial: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    users: [],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Orlando Teste",
        cpf: "000",
        createdAt: "",
        updatedAt: "",
      },
    ],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    votacaoPautas: [],
    votacaoVotos: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 10 },
    ...partial,
  } as AppData;
}

function nota(id: string, status: NotaPedido["status"], mes = "2026-09"): NotaPedido {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: mes,
    instituicaoId: "i1",
    dataEntrega: `${mes}-15`,
    status,
    itens: [{ produtoId: "p1", quantidade: 10, valorUnitario: 10, valorTotal: 100 }],
    valorBruto: 100,
    percentualDescontoCooperativa: 0,
    valorDesconto: 0,
    valorLiquido: 100,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function ficha(id: string, notaId: string, mes: string): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: notaId,
    mesReferencia: mes,
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    status: "pendente",
    descricao: `Entrega nota ${notaId}`,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function assertEquiv(data: AppData, opts?: { carregandoNuvem?: boolean; financeiroSincronizando?: boolean }) {
  const bic = getProjecaoFinanceiraCooperadoBIC(data, COOPERADO, COOP, opts);
  const m6 = getValorQuantoVouReceber(data, COOPERADO, COOP);
  const m8 = cooperadoExibirValorReceberInicio(data, COOPERADO, COOP);
  const m7 = getResumoQuantoVouReceberCooperado(data, COOPERADO, COOP, opts);
  assert.deepEqual(bic.quantoVouReceber, m6);
  assert.deepEqual(bic.inicio, m8);
  assert.deepEqual(bic.painelQuantoVouReceber, m7);
}

// 1) sem pagamento
assertEquiv(
  baseData({
    fichaCorrida: [ficha("f1", "n1", "2026-09")],
    notasPedido: [nota("n1", "conferida")],
  })
);

// 2) aguardando confirmação
{
  let data = baseData({
    fichaCorrida: [{ ...ficha("f1", "n1", "2026-09"), status: "pago" }],
    notasPedido: [nota("n1", "pago")],
  });
  data = registrarPagamentoCooperado(data, COOPERADO, "2026-09", "Resp");
  assertEquiv(data);
}

// 3–4) confirmado + assinatura (Orlando-shaped stale guard)
{
  const MES = "2026-09";
  const data = baseData({
    fichaCorrida: [{ ...ficha("f1", "n1", MES), status: "pago" }],
    notasPedido: [{ ...nota("n1", "pago"), mesReferencia: MES }],
    pagamentosCooperado: [
      {
        id: "pg_stale_aguardando",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        mesesReferencia: [MES],
        valorBruto: 123.42,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 123.42,
        fichaIds: ["f1"],
        notaPedidoIds: ["n1"],
        status: "aguardando_confirmacao",
        pagoPor: "Resp",
        pagoEm: "2026-09-20T12:00:00.000Z",
        createdAt: "2026-09-20T12:00:00.000Z",
      },
      {
        id: "pg_confirmado_orlando",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        mesesReferencia: [MES],
        valorBruto: 123.42,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 123.42,
        fichaIds: ["f1"],
        notaPedidoIds: ["n1"],
        status: "confirmado",
        assinadoEm: "2026-09-21T14:00:00.000Z",
        assinaturaCooperado: "data:image/png;base64,abc",
        pagoPor: "Resp",
        pagoEm: "2026-09-20T12:00:00.000Z",
        createdAt: "2026-09-21T14:00:00.000Z",
      },
    ] as PagamentoCooperadoRegistro[],
  });
  assertEquiv(data);
}

// 5) múltiplos meses
assertEquiv(
  baseData({
    fichaCorrida: [ficha("f1", "n1", "2026-08"), ficha("f2", "n2", "2026-09")],
    notasPedido: [nota("n1", "conferida", "2026-08"), nota("n2", "conferida", "2026-09")],
  })
);

// carregamento UI (M7 only — M6/M8 unchanged)
assertEquiv(
  baseData({
    fichaCorrida: [ficha("f1", "n1", "2026-09")],
    notasPedido: [nota("n1", "conferida")],
  }),
  { carregandoNuvem: true, financeiroSincronizando: true }
);

console.log("OK — BIC B1.2 fachada equivalente aos motores M6/M7/M8");
