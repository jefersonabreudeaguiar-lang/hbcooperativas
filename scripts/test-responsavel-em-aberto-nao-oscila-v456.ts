/**
 * Conferir → lançamentos em aberto: lista não some no sync/conferência.
 * Uso: npx tsx scripts/test-responsavel-em-aberto-nao-oscila-v456.ts
 */
import assert from "node:assert/strict";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  appDataParaConferirLeitura,
  cooperadoEmAbertoPodeSair,
  fundirLinhasEmAbertoEstavel,
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import type { LinhaPagarCooperadoEmAberto } from "../src/services/relatorioService.ts";

assert.ok(APP_BUILD_VERSION >= 456);

const COOP = "coop-1";
const MES = "2026-10";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop Test", cnpj: "62351750000165", active: true }],
    cooperados: [],
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
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function cooperado(i: number): AppData["cooperados"][0] {
  return {
    id: `c-${i}`,
    nomeCompleto: `Cooperado ${String(i).padStart(2, "0")}`,
    cooperativaId: COOP,
    status: "ativo",
    chavePix: `pix${i}@test`,
  } as AppData["cooperados"][0];
}

function nota(i: number): NotaPedido {
  return {
    id: `n-${i}`,
    cooperadoId: `c-${i}`,
    cooperativaId: COOP,
    mesReferencia: MES,
    status: "conferida",
    valorLiquido: 100,
    itens: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    dataEntrega: "2026-10-01",
    dataConferencia: "2026-10-02T00:00:00.000Z",
  } as NotaPedido;
}

function ficha(i: number): FichaCorrida {
  return {
    id: `f-${i}`,
    notaPedidoId: `n-${i}`,
    cooperadoId: `c-${i}`,
    cooperativaId: COOP,
    mesReferencia: MES,
    status: "pendente",
    descricao: `Entrega ${i}`,
    valorBruto: 110,
    valorLiquido: 100,
    descontos: 10,
    dataLancamento: "2026-10-02T00:00:00.000Z",
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  } as FichaCorrida;
}

function dataComNCooperados(n: number): AppData {
  const data = emptyData();
  for (let i = 1; i <= n; i++) {
    data.cooperados.push(cooperado(i));
    data.notasPedido.push(nota(i));
    data.fichaCorrida.push(ficha(i));
  }
  return data;
}

function linha(i: number, total = 100): LinhaPagarCooperadoEmAberto {
  return {
    cooperadoId: `c-${i}`,
    cooperado: `Cooperado ${String(i).padStart(2, "0")}`,
    meses: [MES],
    mesesLabel: MES,
    entregas: 1,
    total,
    porMes: [{ mes: MES, mesLabel: MES, entregas: 1, total }],
  };
}

function pixConfirmado(i: number): PagamentoCooperadoRegistro {
  return {
    id: `pix-${i}`,
    cooperativaId: COOP,
    cooperadoId: `c-${i}`,
    mesReferencia: MES,
    valorBruto: 110,
    descontoCooperativa: 10,
    descontosExtras: [],
    valorLiquido: 100,
    fichaIds: [`f-${i}`],
    notaPedidoIds: [`n-${i}`],
    status: "confirmado",
    pagoPor: "resp-1",
    pagoEm: "2026-10-17T12:00:00.000Z",
    createdAt: "2026-10-17T12:00:00.000Z",
  };
}

const nove = Array.from({ length: 9 }, (_, i) => linha(i + 1));

const fundidoVazio = fundirLinhasEmAbertoEstavel(nove, [], emptyData(), COOP);
assert.equal(fundidoVazio.length, 9, "sync sem ficha não apaga os 9 em aberto");

const dataSemFichas = dataComNCooperados(9);
dataSemFichas.fichaCorrida = [];
dataSemFichas.notasPedido = [];
assert.equal(
  fundirLinhasEmAbertoEstavel(nove, [], dataSemFichas, COOP).length,
  9,
  "cadastro sem ficha (sync incompleto) mantém os 9"
);

const dataPix1 = dataComNCooperados(9);
dataPix1.pagamentosCooperado.push(pixConfirmado(1));
assert.equal(cooperadoEmAbertoPodeSair(dataPix1, "c-1", COOP), true);
assert.equal(cooperadoEmAbertoPodeSair(dataPix1, "c-2", COOP), false);
const motor8 = nove.slice(1);
assert.equal(fundirLinhasEmAbertoEstavel(nove, motor8, dataPix1, COOP).length, 8);

const extra = [...nove, linha(10)];
assert.equal(fundirLinhasEmAbertoEstavel(nove, extra, dataComNCooperados(10), COOP).length, 10);

resetResponsavelPainelIndexCache();
const relatorio9 = getRelatorioLancamentosEmAbertoResponsavel(dataComNCooperados(9), COOP);
assert.equal(relatorio9.length, 9, "motor inicial lista os 9 cooperados em aberto");
assert.equal(relatorio9[0]?.total, 100, "Conferir Em aberto usa líquido, não bruto");

resetResponsavelPainelIndexCache();
const leitura = appDataParaConferirLeitura(dataComNCooperados(9));
assert.equal(leitura.fichaCorrida.length, 9);
const leituraVazia = appDataParaConferirLeitura({ ...leitura, fichaCorrida: [] });
assert.equal(leituraVazia.fichaCorrida.length, 9, "contrato de leitura não troca 9 fichas por vazio");

const dataCincoAbertos = dataComNCooperados(9);
for (let i = 6; i <= 9; i++) {
  const f = dataCincoAbertos.fichaCorrida.find((x) => x.id === `f-${i}`);
  if (f) f.status = "pago";
  dataCincoAbertos.pagamentosCooperado.push(pixConfirmado(i));
}
const motorCinco = Array.from({ length: 5 }, (_, i) => linha(i + 1));
assert.equal(
  fundirLinhasEmAbertoEstavel(nove, motorCinco, dataCincoAbertos, COOP).length,
  5,
  "já pagos saem do Em aberto quando o motor traz só os reais"
);
assert.equal(cooperadoEmAbertoPodeSair(dataCincoAbertos, "c-7", COOP), true);
assert.equal(cooperadoEmAbertoPodeSair(dataCincoAbertos, "c-1", COOP), false);

resetResponsavelPainelIndexCache();
const dataPixCobrePendente = dataComNCooperados(2);
dataPixCobrePendente.pagamentosCooperado.push(pixConfirmado(2));
const relatorioAposPix = getRelatorioLancamentosEmAbertoResponsavel(dataPixCobrePendente, COOP);
assert.equal(
  relatorioAposPix.some((l) => l.cooperadoId === "c-2"),
  false,
  "PIX confirmado tira o cooperado mesmo com ficha ainda pendente"
);
assert.equal(relatorioAposPix.some((l) => l.cooperadoId === "c-1"), true);

console.log("ok: em aberto estável — 9 cooperados não oscilam sem PIX");
