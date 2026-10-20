/**
 * Contrato Pagar cooperados — não retrocede a fila nem abre em Ficha.
 * npx tsx scripts/test-responsavel-pagar-cooperados-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData, FichaCorrida, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  applyPagarSlice,
  extractPagarSlice,
  pagarRegrediu,
  pagarSliceValido,
  reaplicarAbaLastGoodSeRegrediu,
} from "../src/lib/responsavel/abaLastGoodCheckpoint.ts";
import {
  RESPONSAVEL_PAGAR_COOPERADOS_ABA_PADRAO,
  RESPONSAVEL_PAGAR_COOPERADOS_CONTRATO_VERSION,
  RESPONSAVEL_PAGAR_COOPERADOS_TITULO,
  abaInicialPagarCooperadosResponsavel,
  staffPagarNaoPuxaOperacionalAoAbrir,
} from "../src/lib/responsavel/responsavelPagarCooperadosContrato.ts";
import {
  listCooperadosPagamentoPendenteResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const COOP = "coop-pagar-lock";
const MES = "2026-10";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert.equal(RESPONSAVEL_PAGAR_COOPERADOS_CONTRATO_VERSION, 1);
assert.equal(RESPONSAVEL_PAGAR_COOPERADOS_ABA_PADRAO, "pagar");
assert.equal(RESPONSAVEL_PAGAR_COOPERADOS_TITULO, "Pagar cooperados");
assert.equal(abaInicialPagarCooperadosResponsavel({}), "pagar");
assert.equal(abaInicialPagarCooperadosResponsavel({ abaQuery: "ficha" }), "ficha");
assert.equal(abaInicialPagarCooperadosResponsavel({ filaQuery: "assinaturas" }), "pagar");
assert.equal(staffPagarNaoPuxaOperacionalAoAbrir(), true);

const fichaUi = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.match(fichaUi, /abaInicialPagarCooperadosResponsavel/);
assert.match(fichaUi, /tryReaplicarPagarLastGoodSeRegrediuInStore/);
assert.match(fichaUi, /peekStaffGestaoLastGood/);
assert.match(fichaUi, /RESPONSAVEL_PAGAR_COOPERADOS_TITULO/);
assert.equal(fichaUi.includes('requestSyncTier("financeiro_delta"'), false);
assert.match(
  fichaUi,
  /Pagar cooperados: não puxa operacional ao abrir a aba/
);
assert.match(
  fichaUi,
  /<CooperadoApresentacaoFinanceiraGate>/,
  "Pagar envolve o gate — responsável não cai na tela de erro"
);
const gate = read("src/components/cooperado/CooperadoApresentacaoFinanceiraGate.tsx");
assert.match(gate, /APRESENTACAO_FINANCEIRA_FORA_DO_GATE/);
assert.doesNotMatch(
  gate,
  /throw new Error\(\s*"useCooperadoApresentacaoFinanceiraConsolidada requer/,
  "sem gate o Pagar não derruba a aba"
);

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" }],
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
    instituicoes: [],
    produtosInstituicao: [],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    valoresAvulsosReceber: [],
    fechamentosMensais: [],
    arquivosMensais: [],
    livroCaixa: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

const fichaPendente = {
  id: "f-aberto",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  mesReferencia: MES,
  notaPedidoId: "n-1",
  status: "pendente",
  valorBruto: 110,
  valorLiquido: 100,
  descontos: 10,
  saldoAcumulado: 0,
  descricao: "aberto",
  dataLancamento: "2026-10-02T00:00:00.000Z",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
} as FichaCorrida;

const notaAberta = {
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
} as AppData["notasPedido"][0];

const comFila = {
  ...emptyData(),
  fichaCorrida: [fichaPendente],
  notasPedido: [notaAberta],
};
const lastGoodFila = extractPagarSlice(comFila, COOP);
assert.equal(pagarSliceValido(lastGoodFila), true, "fila a pagar sozinha já é lastro válido");

const puxadoVazio = { ...comFila, fichaCorrida: [] };
assert.equal(
  pagarRegrediu(extractPagarSlice(puxadoVazio, COOP), lastGoodFila),
  true,
  "sumir a ficha em aberto é retroceder"
);

const restaurado = reaplicarAbaLastGoodSeRegrediu(puxadoVazio, COOP, "pagar", lastGoodFila);
assert.equal(
  restaurado.fichaCorrida.some((f) => f.id === "f-aberto" && f.status === "pendente"),
  true,
  "last-good devolve quem ainda está a pagar"
);

resetResponsavelPainelIndexCache();
assert.equal(listCooperadosPagamentoPendenteResponsavel(restaurado, COOP).length, 1);

const fotoConferirMarcouPago = {
  ...comFila,
  notasPedido: comFila.notasPedido.map((n) => ({ ...n, status: "pago" as const })),
  fichaCorrida: comFila.fichaCorrida.map((f) => ({ ...f, status: "pago" as const })),
};
resetResponsavelPainelIndexCache();
assert.equal(
  listCooperadosPagamentoPendenteResponsavel(fotoConferirMarcouPago, COOP).length,
  1,
  "Pagar lista quem tem valor em aberto mesmo se o Conferir marcou a ficha como paga"
);

const pix: PagamentoCooperadoRegistro = {
  id: "pix-ok",
  cooperativaId: COOP,
  cooperadoId: "c-1",
  mesReferencia: "2026-07",
  valorBruto: 110,
  descontoCooperativa: 10,
  descontosExtras: [],
  valorLiquido: 100,
  fichaIds: ["f-pago"],
  notaPedidoIds: ["n-pago"],
  status: "confirmado",
  pagoPor: "resp",
  pagoEm: "2026-07-12T00:00:00.000Z",
  createdAt: "2026-07-12T00:00:00.000Z",
} as PagamentoCooperadoRegistro;

const fichaPaga = {
  ...fichaPendente,
  id: "f-pago",
  mesReferencia: "2026-07",
  notaPedidoId: "n-pago",
  status: "pago",
  updatedAt: "2026-07-12T00:00:00.000Z",
} as FichaCorrida;

const pago = { ...emptyData(), pagamentosCooperado: [pix], fichaCorrida: [fichaPaga] };
const lastGoodPago = extractPagarSlice(pago, COOP);
const reaberto = {
  ...pago,
  pagamentosCooperado: [],
  fichaCorrida: [{ ...fichaPaga, status: "pendente" as const }],
};
const naoReabre = reaplicarAbaLastGoodSeRegrediu(reaberto, COOP, "pagar", lastGoodPago);
assert.equal(
  naoReabre.pagamentosCooperado.some((p) => p.id === "pix-ok" && p.status === "confirmado"),
  true
);
assert.equal(naoReabre.fichaCorrida.find((f) => f.id === "f-pago")?.status, "pago");

const comNovo = applyPagarSlice(
  {
    ...naoReabre,
    fichaCorrida: [...naoReabre.fichaCorrida, fichaPendente],
  },
  COOP,
  lastGoodPago
);
assert.equal(
  comNovo.fichaCorrida.some((f) => f.id === "f-aberto" && f.status === "pendente"),
  true,
  "lançamento novo sem PIX permanece na fila"
);

console.log("test-responsavel-pagar-cooperados-contrato.ts ok");
