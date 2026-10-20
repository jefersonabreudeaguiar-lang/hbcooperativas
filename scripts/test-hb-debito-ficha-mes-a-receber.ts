/**
 * Compra HB debita a ficha do mês certo e o A receber já sai líquido.
 * npx tsx scripts/test-hb-debito-ficha-mes-a-receber.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import {
  filtrarDescontosContaCoopParaMesReferencia,
  mesAlvoDebitoContaCoop,
  type DescontoContaCoopRemoto,
} from "../src/lib/hb-credit/mergeFichaDescontos";
import {
  getResumoPagamentoConsolidadoCooperado,
  getResumoPagamentoCooperado,
  persistDescontosContaCoopNoArquivo,
} from "../src/services/notaPedidoService";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService";

const COOP = "coop-hb-debito";
const COOPERADO = "c_hb_debito";

function compra(mesIso: string, valor: number, id: string): DescontoContaCoopRemoto {
  return {
    motivo: `Compra HB Créditos — mercado (${id})`,
    valorReais: valor,
    tipo: "conta_coop",
    createdAt: mesIso,
    hbTransactionId: id,
  };
}

function ficha(id: string, notaId: string, mes: string, valor: number) {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: notaId,
    mesReferencia: mes,
    status: "pendente" as const,
    valorBruto: valor,
    descontos: 0,
    valorLiquido: valor,
    descricao: "Entrega",
    createdAt: `${mes}-01T00:00:00.000Z`,
  };
}

function nota(id: string, mes: string, valor: number) {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: mes,
    status: "conferida" as const,
    valorBruto: valor,
    valorLiquido: valor,
    instituicaoId: "i1",
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: valor }],
    createdAt: `${mes}-01T00:00:00.000Z`,
    updatedAt: `${mes}-01T00:00:00.000Z`,
  };
}

function baseData(meses: Array<{ mes: string; valor: number }>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "HB Debito",
        cpf: "000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: meses.map((m, i) => nota(`n${i + 1}`, m.mes, m.valor)),
    fichaCorrida: meses.map((m, i) => ficha(`f${i + 1}`, `n${i + 1}`, m.mes, m.valor)),
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
  } as AppData;
}

{
  const pending = ["2026-08", "2026-09"];
  assert.equal(mesAlvoDebitoContaCoop("2026-08", "2026-08", pending), true);
  assert.equal(mesAlvoDebitoContaCoop("2026-08", "2026-09", pending), false);
  assert.equal(mesAlvoDebitoContaCoop("2026-09", "2026-09", pending), true);
  assert.equal(mesAlvoDebitoContaCoop("2026-09", "2026-08", pending), false);
  assert.equal(mesAlvoDebitoContaCoop("2026-10", "2026-09", pending), true, "compra de outubro cai na última ficha aberta");
  assert.equal(mesAlvoDebitoContaCoop("2026-10", "2026-08", pending), false, "agosto não leva compra de outubro");
}

{
  const linhas = [
    compra("2026-08-10T12:00:00.000Z", 20, "tx_ago"),
    compra("2026-09-10T12:00:00.000Z", 30, "tx_set"),
    compra("2026-10-05T12:00:00.000Z", 40, "tx_out"),
  ];
  const pending = ["2026-08", "2026-09"];
  const ago = filtrarDescontosContaCoopParaMesReferencia(linhas, "2026-08", pending);
  const set = filtrarDescontosContaCoopParaMesReferencia(linhas, "2026-09", pending);
  assert.deepEqual(
    ago.map((d) => d.hbTransactionId),
    ["tx_ago"]
  );
  assert.deepEqual(
    set.map((d) => d.hbTransactionId).sort(),
    ["tx_out", "tx_set"]
  );
}

{
  let data = baseData([{ mes: "2026-09", valor: 500 }]);
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, "2026-09", COOP, [
    compra("2026-10-08T14:00:00.000Z", 80, "tx_out_sep"),
  ]);
  const resumo = getResumoPagamentoCooperado(data, COOPERADO, "2026-09", COOP);
  assert.equal(resumo.valorEntregas, 500);
  assert.equal(resumo.valorLiquido, 420, "compra de outubro debita a ficha de setembro ainda em aberto");
  assert.ok(resumo.descontosExtras.some((d) => d.tipo === "conta_coop"));
  assert.equal(getValorQuantoVouReceber(data, COOPERADO, COOP).valor, 420);
}

{
  let data = baseData([
    { mes: "2026-08", valor: 200 },
    { mes: "2026-09", valor: 300 },
  ]);
  const linhas = [
    compra("2026-08-12T10:00:00.000Z", 25, "tx_ago"),
    compra("2026-09-12T10:00:00.000Z", 35, "tx_set"),
    compra("2026-10-12T10:00:00.000Z", 40, "tx_out"),
  ];
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, "2026-08", COOP, linhas);
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, "2026-09", COOP, linhas);

  const ago = getResumoPagamentoCooperado(data, COOPERADO, "2026-08", COOP);
  const set = getResumoPagamentoCooperado(data, COOPERADO, "2026-09", COOP);
  assert.equal(ago.valorLiquido, 175, "agosto só a compra de agosto");
  assert.equal(set.valorLiquido, 225, "setembro: compra de setembro + outubro");

  const consolidado = getResumoPagamentoConsolidadoCooperado(data, COOPERADO, ["2026-08", "2026-09"], COOP);
  assert.equal(consolidado.valorEntregas, 500);
  assert.equal(consolidado.valorLiquido, 400, "A receber consolidado não conta a mesma compra duas vezes");
  assert.equal(getValorQuantoVouReceber(data, COOPERADO, COOP).valor, 400);
}

console.log("ok hb-debito-ficha-mes-a-receber");
