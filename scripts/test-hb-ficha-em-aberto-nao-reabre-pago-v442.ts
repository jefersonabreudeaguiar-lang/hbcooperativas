/**
 * HB + ficha: mês liquidado não volta ao crédito-base / a receber.
 * Uso: npx tsx scripts/test-hb-ficha-em-aberto-nao-reabre-pago-v442.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types/index.ts";
import { hbCreditCreditoBaseReais } from "../src/lib/hb-credit/hbCreditCreditoBaseCalculo.ts";
import { getCreditoBaseContaCoopReais } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import {
  getResumoValorAPagarRelatorio,
  listarFichasEmAbertoPagamento,
} from "../src/services/notaPedidoService.ts";
import { listarMesesEmAbertoPagamentoResponsavel } from "../src/services/cooperadoEntregasService.ts";
import { listarResumosFichaEmAbertoCooperado } from "../src/services/cooperadoFichaTimelineService.ts";

const COOP = "coop-1";
const CID = "coop-member-1";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop Test", cnpj: "12345678000199", active: true }],
    cooperados: [
      {
        id: CID,
        nomeCompleto: "Cooperado Teste",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "pix@test",
      },
    ],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    cotas: [],
    financeiroMensal: [],
    auditLog: [],
    equipe: [],
    comunicados: [],
    votacoes: [],
    prestacaoContas: [],
    contratos: [],
    instituicoes: [],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    fechamentosMensais: [],
    arquivosMensais: [],
    livroCaixa: [],
    ajustesFichaMes: [],
    fechamentos: [],
    config: { descontoPadraoCooperativa: 10 },
  } as unknown as AppData;
}

function nota(id: string, mes: string, createdAt: string, extra?: Partial<AppData["notasPedido"][0]>) {
  return {
    id,
    cooperadoId: CID,
    cooperativaId: COOP,
    mesReferencia: mes,
    status: "conferida",
    valorLiquido: 100,
    itens: [],
    createdAt,
    dataEntrega: createdAt.slice(0, 10),
    dataConferencia: createdAt,
    ...extra,
  } as AppData["notasPedido"][0];
}

function ficha(
  id: string,
  notaId: string,
  mes: string,
  createdAt: string,
  valorBruto: number,
  valorLiquido: number
) {
  return {
    id,
    cooperadoId: CID,
    cooperativaId: COOP,
    mesReferencia: mes,
    notaPedidoId: notaId,
    status: "pendente" as const,
    descricao: id,
    valorBruto,
    valorLiquido,
    descontos: valorBruto - valorLiquido,
    dataLancamento: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

{
  const mesPago = "2026-09";
  const mesNovo = "2026-10";
  const data = emptyData();
  data.notasPedido = [
    nota("n-set", mesPago, "2026-09-10T00:00:00.000Z", { valorLiquido: 180 }),
    nota("n-out", mesNovo, "2026-10-16T00:00:00.000Z", { valorLiquido: 40 }),
  ];
  data.fichaCorrida = [
    ficha("f-set", "n-set", mesPago, "2026-09-10T00:00:00.000Z", 200, 180),
    ficha("f-out", "n-out", mesNovo, "2026-10-16T00:00:00.000Z", 45, 40),
  ];
  data.pagamentosCooperado = [
    {
      id: "pg-set",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mesPago,
      status: "confirmado",
      valorLiquido: 180,
      valorBruto: 200,
      descontoCooperativa: 20,
      descontosExtras: [],
      fichaIds: ["f-set-id-antigo"],
      notaPedidoIds: [],
      pagoEm: "2026-09-20T00:00:00.000Z",
      createdAt: "2026-09-20T00:00:00.000Z",
    },
  ];

  assert.equal(listarFichasEmAbertoPagamento(data, CID, mesPago, COOP).length, 0);
  assert.equal(listarFichasEmAbertoPagamento(data, CID, mesNovo, COOP).length, 1);
  assert.equal(getResumoValorAPagarRelatorio(data, CID, mesPago, COOP).valorLiquido, 0);
  assert.ok(getResumoValorAPagarRelatorio(data, CID, mesNovo, COOP).valorLiquido > 0);
  const meses = listarMesesEmAbertoPagamentoResponsavel(data, CID, COOP);
  assert.equal(meses.includes(mesPago), false, "mês liquidado sai de em aberto");
  assert.equal(meses.includes(mesNovo), true, "lançamento novo fica em aberto");
  const base = hbCreditCreditoBaseReais(data, CID, COOP);
  assert.ok(base > 0 && base < 50, `HB lastro só o mês novo, veio ${base}`);
  const fichaAberta = listarResumosFichaEmAbertoCooperado(data, CID, COOP);
  assert.equal(fichaAberta.some((r) => r.mesReferencia === mesPago), false);
  assert.equal(fichaAberta.some((r) => r.mesReferencia === mesNovo), true);
}

{
  const mes = "2026-09";
  const data = emptyData();
  data.notasPedido = [
    nota("n-pago", mes, "2026-09-05T00:00:00.000Z", {
      valorLiquido: 90,
      updatedAt: "2026-10-17T12:00:00.000Z",
    }),
    nota("n-novo", mes, "2026-10-16T18:00:00.000Z", { valorLiquido: 30 }),
  ];
  data.fichaCorrida = [
    ficha("f-pago", "n-pago", mes, "2026-09-05T00:00:00.000Z", 100, 90),
    ficha("f-novo", "n-novo", mes, "2026-10-16T18:00:00.000Z", 33, 30),
  ];
  data.fichaCorrida[0]!.updatedAt = "2026-10-17T12:00:00.000Z";
  data.pagamentosCooperado = [
    {
      id: "pg-mes",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "confirmado",
      valorLiquido: 90,
      valorBruto: 100,
      fichaIds: ["f-pago-velho"],
      notaPedidoIds: [],
      pagoEm: "2026-09-18T00:00:00.000Z",
      createdAt: "2026-09-18T00:00:00.000Z",
    },
  ];

  const abertas = listarFichasEmAbertoPagamento(data, CID, mes, COOP);
  assert.deepEqual(abertas.map((f) => f.id), ["f-novo"]);
  const rel = getResumoValorAPagarRelatorio(data, CID, mes, COOP);
  assert.ok(rel.valorLiquido <= 33.01 && rel.valorLiquido >= 29);
  const base = hbCreditCreditoBaseReais(data, CID, COOP);
  assert.ok(base <= 34 && base >= 29, `mês misto não pode somar o pago, veio ${base}`);
}

{
  const mes = "2026-08";
  const data = emptyData();
  data.notasPedido = [nota("n-so-pago", mes, "2026-08-02T00:00:00.000Z", { valorLiquido: 70, status: "pago" })];
  data.fichaCorrida = [
    { ...ficha("f-so-pago", "n-so-pago", mes, "2026-08-02T00:00:00.000Z", 80, 70), status: "pago" },
  ];
  data.pagamentosCooperado = [
    {
      id: "pg-so",
      cooperadoId: CID,
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "confirmado",
      valorLiquido: 70,
      valorBruto: 80,
      fichaIds: ["f-so-pago"],
      notaPedidoIds: ["n-so-pago"],
      pagoEm: "2026-08-15T00:00:00.000Z",
      createdAt: "2026-08-15T00:00:00.000Z",
    },
  ];
  assert.equal(hbCreditCreditoBaseReais(data, CID, COOP), 0);
  assert.equal(getCreditoBaseContaCoopReais(data, CID, COOP), 0);
  assert.equal(listarMesesEmAbertoPagamentoResponsavel(data, CID, COOP).length, 0);
}

console.log("test-hb-ficha-em-aberto-nao-reabre-pago-v442: OK");
