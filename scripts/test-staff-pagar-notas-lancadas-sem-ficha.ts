/**
 * Aba Pagar: cooperado com nota conferida sem PIX entra na lista mesmo sem ficha persistida.
 * npx tsx scripts/test-staff-pagar-notas-lancadas-sem-ficha.ts
 */
import assert from "node:assert/strict";
import type { AppData, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  appDataParaPagarCooperadosResponsavel,
  cooperadoTemNotaConferidaSemPix,
  listarMesesNotaConferidaSemPix,
  listCooperadosPagamentoPendenteResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";

const COOP = "coop-pagar";
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

assert.equal(
  cooperadoTemNotaConferidaSemPix(soNota, "c-1", COOP),
  true,
  "nota conferida sem PIX conta para Pagar"
);
assert.deepEqual(listarMesesNotaConferidaSemPix(soNota, "c-1", COOP), [MES]);

const lista = listCooperadosPagamentoPendenteResponsavel(soNota, COOP);
assert.equal(lista.length, 1, "select Pagar lista quem tem nota lançada sem PIX");
assert.equal(lista[0]?.id, "c-1");

const proj = appDataParaPagarCooperadosResponsavel(soNota, COOP);
assert.ok(
  (proj.fichaCorrida ?? []).some((f) => f.notaPedidoId === "n-1" && f.status === "pendente"),
  "projeção cria ficha pendente da nota conferida"
);

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
  cooperadoTemNotaConferidaSemPix(comPix, "c-1", COOP),
  false,
  "nota coberta por PIX some do Pagar"
);
assert.equal(
  listCooperadosPagamentoPendenteResponsavel(comPix, COOP).length,
  0,
  "com PIX confirmado o select Pagar fica vazio"
);

console.log("test-staff-pagar-notas-lancadas-sem-ficha.ts ok");
