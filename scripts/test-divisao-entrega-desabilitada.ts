/**
 * Divisão de entrega desligada: valor fica só no cooperado da nota.
 * npx tsx scripts/test-divisao-entrega-desabilitada.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types";
import { DIVISAO_ENTREGA_HABILITADA } from "../src/lib/conferencia/divisaoEntregaPolicy";
import {
  criarDivisaoEntregaFromParticipantes,
  dividirEntregaEntreCooperados,
  inferirDivisaoEntregaDasFichas,
  rebuildFichasNota,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";

assert.equal(DIVISAO_ENTREGA_HABILITADA, false, "flag deve estar desligada neste deploy");

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
  id: "np1",
  cooperativaId: COOP,
  cooperadoId: "cleito",
  cooperadoNomeSnapshot: "Cleito",
  instituicaoId: "i1",
  numeroNota: "1",
  dataEntrega: "2026-08-01",
  mesReferencia: "2026-08",
  status: "conferida",
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
};

assert.equal(inferirDivisaoEntregaDasFichas(data, notaDiv), undefined);

const rebuilt = rebuildFichasNota(data, notaDiv);
const fichasRebuild = rebuilt.fichaCorrida.filter((f) => f.notaPedidoId === notaDiv.id);
assert.equal(fichasRebuild.length, 1);
assert.equal(fichasRebuild[0]!.cooperadoId, "cleito");
assert.equal(fichasRebuild[0]!.valorLiquido, 90);

const noopDiv = dividirEntregaEntreCooperados(data, notaDiv.id, ["ivan"], COOP);
assert.equal(noopDiv.fichaCorrida.length, data.fichaCorrida.length);

const next = reconciliarFichaFromNotasConferidas(data);
const fichas = next.fichaCorrida.filter((f) => f.notaPedidoId === notaDiv.id);
assert.equal(fichas.length, 1);
assert.equal(fichas[0]!.cooperadoId, "cleito");
assert.equal(fichas[0]!.valorLiquido, 90);
assert.equal(next.notasPedido[0]!.divisaoEntrega, undefined);

console.log("test-divisao-entrega-desabilitada: OK");
