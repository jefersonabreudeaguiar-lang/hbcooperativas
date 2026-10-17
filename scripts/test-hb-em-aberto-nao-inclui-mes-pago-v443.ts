/**
 * HB / ficha: mês já liquidado não entra no crédito-base; só lançamento depois do PIX.
 * npx tsx scripts/test-hb-em-aberto-nao-inclui-mes-pago-v443.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types/index.ts";
import { hbCreditCreditoBaseReais } from "../src/lib/hb-credit/hbCreditCreditoBaseCalculo.ts";
import { listarFichasEmAbertoPagamento } from "../src/services/notaPedidoService.ts";

const COOP = "coop-1";
const CID = "coop-member-1";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "12345678000199", active: true }],
    cooperados: [
      {
        id: CID,
        nomeCompleto: "Cooperado",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "pix@test",
      } as AppData["cooperados"][0],
    ],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    arquivosMensais: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

// 1 — mês passado pago (ficha ainda pendente, fichaIds velhos, updatedAt depois do PIX) = 0
{
  const mes = "2026-09";
  const data = emptyData();
  data.notasPedido = [
    {
      id: "n-set",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "conferida",
      valorLiquido: 800,
      valorBruto: 900,
      itens: [],
      createdAt: "2026-09-05T00:00:00.000Z",
      dataEntrega: "2026-09-05",
      dataConferencia: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    } as AppData["notasPedido"][0],
  ];
  data.fichaCorrida = [
    {
      id: "f-set-novo-id",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      notaPedidoId: "n-set",
      status: "pendente",
      valorBruto: 900,
      valorLiquido: 800,
      descontos: 100,
      dataLancamento: "2026-09-06T00:00:00.000Z",
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    },
  ];
  data.pagamentosCooperado = [
    {
      id: "pg-set",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "confirmado",
      valorLiquido: 800,
      valorBruto: 900,
      fichaIds: ["f-set-id-antigo"],
      notaPedidoIds: [],
      pagoEm: "2026-09-20T00:00:00.000Z",
      createdAt: "2026-09-20T00:00:00.000Z",
    },
  ];
  assert.equal(listarFichasEmAbertoPagamento(data, CID, mes, COOP).length, 0);
  assert.equal(hbCreditCreditoBaseReais(data, CID, COOP), 0, "mês liquidado não entra no HB");
}

// 2 — mês pago + lançamento recente no mês seguinte: só o novo
{
  const data = emptyData();
  data.notasPedido = [
    {
      id: "n-set",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: "2026-09",
      status: "conferida",
      valorLiquido: 800,
      itens: [],
      createdAt: "2026-09-05T00:00:00.000Z",
      dataEntrega: "2026-09-05",
      dataConferencia: "2026-09-06T00:00:00.000Z",
    } as AppData["notasPedido"][0],
    {
      id: "n-out",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: "2026-10",
      status: "conferida",
      valorLiquido: 45,
      itens: [],
      createdAt: "2026-10-17T12:00:00.000Z",
      dataEntrega: "2026-10-17",
      dataConferencia: "2026-10-17T12:00:00.000Z",
    } as AppData["notasPedido"][0],
  ];
  data.fichaCorrida = [
    {
      id: "f-set",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: "2026-09",
      notaPedidoId: "n-set",
      status: "pendente",
      valorBruto: 900,
      valorLiquido: 800,
      descontos: 100,
      dataLancamento: "2026-09-06T00:00:00.000Z",
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    },
    {
      id: "f-out",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: "2026-10",
      notaPedidoId: "n-out",
      status: "pendente",
      valorBruto: 50,
      valorLiquido: 45,
      descontos: 5,
      dataLancamento: "2026-10-17T12:00:00.000Z",
      createdAt: "2026-10-17T12:00:00.000Z",
      updatedAt: "2026-10-17T12:00:00.000Z",
    },
  ];
  data.pagamentosCooperado = [
    {
      id: "pg-set",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: "2026-09",
      status: "confirmado",
      valorLiquido: 800,
      valorBruto: 900,
      fichaIds: ["f-set-id-antigo"],
      notaPedidoIds: [],
      pagoEm: "2026-09-20T00:00:00.000Z",
      createdAt: "2026-09-20T00:00:00.000Z",
    },
  ];
  assert.equal(listarFichasEmAbertoPagamento(data, CID, "2026-09", COOP).length, 0);
  const abertasOut = listarFichasEmAbertoPagamento(data, CID, "2026-10", COOP);
  assert.equal(abertasOut.length, 1);
  assert.equal(abertasOut[0]?.id, "f-out");
  assert.equal(hbCreditCreditoBaseReais(data, CID, COOP), 50, "só ficha nova, sem bruto do PIX antigo");
}

// 3 — mesmo mês: PIX + entrega depois do pagamento permanece
{
  const mes = "2026-10";
  const data = emptyData();
  data.notasPedido = [
    {
      id: "n-antes",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "conferida",
      valorLiquido: 200,
      itens: [],
      createdAt: "2026-10-02T00:00:00.000Z",
      dataEntrega: "2026-10-02",
      dataConferencia: "2026-10-02T00:00:00.000Z",
    } as AppData["notasPedido"][0],
    {
      id: "n-depois",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "conferida",
      valorLiquido: 30,
      itens: [],
      createdAt: "2026-10-16T00:00:00.000Z",
      dataEntrega: "2026-10-16",
      dataConferencia: "2026-10-16T00:00:00.000Z",
    } as AppData["notasPedido"][0],
  ];
  data.fichaCorrida = [
    {
      id: "f-antes",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      notaPedidoId: "n-antes",
      status: "pendente",
      valorBruto: 220,
      valorLiquido: 200,
      descontos: 20,
      dataLancamento: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    },
    {
      id: "f-depois",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      notaPedidoId: "n-depois",
      status: "pendente",
      valorBruto: 35,
      valorLiquido: 30,
      descontos: 5,
      dataLancamento: "2026-10-16T00:00:00.000Z",
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    },
  ];
  data.pagamentosCooperado = [
    {
      id: "pg-parcial",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "confirmado",
      valorLiquido: 200,
      valorBruto: 220,
      fichaIds: ["f-antes-id-antigo"],
      notaPedidoIds: [],
      pagoEm: "2026-10-10T00:00:00.000Z",
      createdAt: "2026-10-10T00:00:00.000Z",
    },
  ];
  const abertas = listarFichasEmAbertoPagamento(data, CID, mes, COOP);
  assert.equal(abertas.length, 1);
  assert.equal(abertas[0]?.id, "f-depois");
  assert.equal(hbCreditCreditoBaseReais(data, CID, COOP), 35);
}

console.log("test-hb-em-aberto-nao-inclui-mes-pago-v443: OK");
