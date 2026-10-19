/**
 * Responsável: Pagar, Em aberto e Início usam o mesmo valor real da nota conferida.
 * npx tsx scripts/test-staff-valores-reais-paridade-v500.ts
 */
import assert from "node:assert/strict";
import type { AppData, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  appDataParaPagarCooperadosResponsavel,
  getRelatorioLancamentosEmAbertoResponsavel,
  listCooperadosPagamentoPendenteResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { getTotalValoresAPagarGestaoCooperativa } from "../src/lib/responsavel/responsavelGestaoLeitura.ts";
import { computeAdminStatsPure } from "../src/lib/performance/adminStatsComputeCore.ts";

const COOP = "coop-reais";
const MES = "2026-10";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop Test", cnpj: "00000000000191", active: true }],
    cooperados: [
      {
        id: "c-1",
        nomeCompleto: "Maria Entrega",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "maria@pix",
      },
    ],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    cotas: [],
    financeiroMensal: [],
    financeiro: [],
    auditLog: [],
    equipe: [],
    comunicados: [],
    votacoes: [],
    prestacaoContas: [],
    contratos: [],
    instituicoes: [{ id: "esc-1", nome: "Escola", cooperativaId: COOP, tipo: "PNAE" }],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    valoresAvulsosReceber: [],
    fechamentosMensais: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    livroCaixa: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function notaConferida(): NotaPedido {
  return {
    id: "n-1",
    cooperadoId: "c-1",
    cooperativaId: COOP,
    instituicaoId: "esc-1",
    numeroNota: "1",
    dataEntrega: "2026-10-02",
    localEntrega: "Escola",
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 110,
    percentualDescontoCooperativa: 10,
    valorDesconto: 10,
    valorLiquido: 100,
    itens: [{ produtoNome: "Alface", unidade: "kg", quantidade: 10, valorUnitario: 11 }],
    createdAt: "2026-10-02T00:00:00.000Z",
    conferidaPor: "resp",
    dataConferencia: "2026-10-03T00:00:00.000Z",
  } as NotaPedido;
}

resetResponsavelPainelIndexCache();
const soNota = { ...emptyData(), notasPedido: [notaConferida()] };

const listaPagar = listCooperadosPagamentoPendenteResponsavel(soNota, COOP);
assert.equal(listaPagar.length, 1, "Pagar lista o cooperado da nota conferida");

const emAberto = getRelatorioLancamentosEmAbertoResponsavel(soNota, COOP);
assert.equal(emAberto.length, 1, "Em aberto mostra a mesma nota, sem ficha persistida");
assert.ok((emAberto[0]?.total ?? 0) > 0.005, "Em aberto tem valor real");

const inicio = getTotalValoresAPagarGestaoCooperativa(soNota, COOP);
const somaAberto = emAberto.reduce((s, l) => s + (l.total ?? 0), 0);
assert.equal(inicio, somaAberto, "Início «a pagar» = soma do Em aberto");

const proj = appDataParaPagarCooperadosResponsavel(soNota, COOP);
assert.ok(
  (proj.fichaCorrida ?? []).some((f) => f.notaPedidoId === "n-1" && f.status === "pendente"),
  "projeção cria ficha pendente da nota conferida"
);

const stats = computeAdminStatsPure(soNota, COOP);
assert.equal(stats.valoresAPagar, inicio, "card do Início usa o mesmo total");
assert.ok(stats.pagamentosPendentes > 0, "Início conta ficha projetada pendente");

resetResponsavelPainelIndexCache();
const comPix: AppData = {
  ...soNota,
  pagamentosCooperado: [
    {
      id: "pix-1",
      cooperativaId: COOP,
      cooperadoId: "c-1",
      mesReferencia: MES,
      valorBruto: 110,
      descontoCooperativa: 10,
      descontosExtras: [],
      valorLiquido: 100,
      fichaIds: [],
      notaPedidoIds: ["n-1"],
      status: "confirmado",
      pagoPor: "resp",
      pagoEm: "2026-10-17T12:00:00.000Z",
      createdAt: "2026-10-17T12:00:00.000Z",
    } as PagamentoCooperadoRegistro,
  ],
};
assert.equal(
  listCooperadosPagamentoPendenteResponsavel(comPix, COOP).length,
  0,
  "com PIX confirmado o Pagar some"
);
assert.equal(
  getRelatorioLancamentosEmAbertoResponsavel(comPix, COOP).length,
  0,
  "com PIX confirmado o Em aberto some"
);
assert.equal(getTotalValoresAPagarGestaoCooperativa(comPix, COOP), 0, "Início zera só após PIX real");

console.log("test-staff-valores-reais-paridade-v500.ts ok");
