/**
 * Nota pago → ficha pago na reconciliação (paridade participantes divisão).
 * npx tsx scripts/test-ficha-status-nota-pago-divisao.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types";
import {
  criarDivisaoEntregaFromParticipantes,
  reconciliarFichaFromNotasConferidas,
  getResumoValorAPagarRelatorio,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";
import { getValorQuantoVouReceberMotorLegado } from "../src/services/cooperadoEntregasService";

const COOP = "coop-x";

function coop(id: string, nome: string) {
  return {
    id,
    cooperativaId: COOP,
    nomeCompleto: nome,
    cpfCnpj: id,
    status: "ativo" as const,
    createdAt: "",
    updatedAt: "",
  };
}

function baseData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [coop("ivan", "Ivan"), coop("cleber", "Cleber"), coop("cleito", "Cleito")],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "Escola", createdAt: "", updatedAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

const nota: NotaPedido = {
  id: "np_pago",
  cooperativaId: COOP,
  cooperadoId: "cleito",
  cooperadoNomeSnapshot: "Cleito",
  instituicaoId: "i1",
  numeroNota: "1",
  dataEntrega: "2026-08-01",
  mesReferencia: "2026-08",
  status: "pago",
  conferidaPor: "R",
  dataConferencia: "2026-08-02",
  itens: [{ produtoInstituicaoId: "p", produtoNome: "X", unidade: "un", precoUnitario: 90, quantidade: 1, valorBruto: 90 }],
  valorBruto: 90,
  valorDesconto: 0,
  valorLiquido: 90,
  percentualDescontoCooperativa: 0,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-02T10:00:00.000Z",
};

let data = baseData();
const divisao = criarDivisaoEntregaFromParticipantes(data, COOP, "cleito", "Cleito", [
  "cleito",
  "ivan",
  "cleber",
])!;
const notaDiv = { ...nota, divisaoEntrega: divisao };
const mk = (cooperadoId: string, liq: number): FichaCorrida => ({
  id: `fc_${cooperadoId}`,
  cooperativaId: COOP,
  cooperadoId,
  notaPedidoId: notaDiv.id,
  mesReferencia: "2026-08",
  descricao: "Entrega",
  valorBruto: liq,
  descontos: 0,
  valorLiquido: liq,
  saldoAcumulado: liq,
  status: "pendente",
  itens: [],
  createdAt: "",
  updatedAt: "",
});
data = {
  ...data,
  notasPedido: [notaDiv],
  fichaCorrida: [mk("ivan", 30), mk("cleber", 30), mk("cleito", 30)],
  pagamentosCooperado: [],
};

const next = reconciliarFichaFromNotasConferidas(data);
for (const id of ["ivan", "cleber", "cleito"]) {
  const f = next.fichaCorrida.find((x) => x.cooperadoId === id)!;
  assert.equal(f.status, "pago", `${id} ficha deve ser pago quando nota pago`);
}

const pos = posProcessarIntegridadePagamentosCooperativa(next);
const cleberF = pos.fichaCorrida.find((x) => x.cooperadoId === "cleber")!;
assert.equal(cleberF.status, "pago", "integridade não reverte ficha quando nota pago");
assert.equal(getResumoValorAPagarRelatorio(pos, "cleber", "2026-08", COOP).valorLiquido, 0);
assert.equal(getValorQuantoVouReceberMotorLegado(pos, "cleber", COOP).valor, 0);

console.log("test-ficha-status-nota-pago-divisao: OK");
