/**
 * Conferir — contrato de leitura: verdade operacional + lastro + BIC anota R$.
 * Uso: npx tsx scripts/test-conferir-leitura-contrato-v458.ts
 */
import assert from "node:assert/strict";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  appDataParaConferirLeitura,
  getRelatorioLancamentosEmAbertoResponsavel,
  listNotasFilaConferenciaResponsavel,
  resetResponsavelPainelIndexCache,
  snapshotConferirPoorerSemProva,
} from "../src/services/responsavelPainelIndex.ts";
import { applyConferenciaOperacionalPushView } from "../src/services/conferenciaOperacionalPushScope.ts";
import { anotarLinhasEmAbertoComBic } from "../src/lib/bic/anotarLinhasEmAbertoComBic.ts";
import { lastroContagemFila } from "../src/utils/filaConferenciaSticky.ts";
import type { LinhaPagarCooperadoEmAberto } from "../src/services/relatorioService.ts";

assert.ok(APP_BUILD_VERSION >= 458);

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

const full = dataComNCooperados(9);
assert.equal(
  snapshotConferirPoorerSemProva({ ...full, fichaCorrida: [] }, full),
  true,
  "fichas vazias sem PIX extra são snapshot pobre"
);
assert.equal(
  snapshotConferirPoorerSemProva(full, full),
  false,
  "mesmo snapshot não é pobre"
);

resetResponsavelPainelIndexCache();
const leituraFull = appDataParaConferirLeitura(full);
assert.equal(leituraFull.fichaCorrida.length, 9, "leitura inicial usa o snapshot rico");
assert.equal(leituraFull.notasPedido.length, 9);

const poor = { ...full, fichaCorrida: [], notasPedido: [] };
const leituraPoor = appDataParaConferirLeitura(poor);
assert.equal(leituraPoor.fichaCorrida.length, 9, "completeness: vazio não substitui os 9");
assert.equal(leituraPoor.notasPedido.length, 9);

resetResponsavelPainelIndexCache();
appDataParaConferirLeitura(full);
const viewed = applyConferenciaOperacionalPushView(full, COOP, new Set());
assert.ok(viewed.fichaCorrida.length < 9, "push scope esconde fichas sem PATCH");
const historicoSobPush = appDataParaConferirLeitura(viewed);
assert.equal(historicoSobPush.fichaCorrida.length, 9, "histórico/correções não perdem fichas no push");
assert.equal(
  historicoSobPush.notasPedido.filter((n) => n.status === "conferida").length,
  9,
  "notas conferidas não rebobinam na leitura da tela"
);

resetResponsavelPainelIndexCache();
const relatorio9 = getRelatorioLancamentosEmAbertoResponsavel(dataComNCooperados(9), COOP);
assert.equal(relatorio9.length, 9, "Em aberto lista os 9");

const anotadas = anotarLinhasEmAbertoComBic(
  dataComNCooperados(9),
  [linha(1), linha(2), linha(3)],
  COOP
);
assert.equal(anotadas.length, 3, "BIC anota R$ e não troca a lista");
assert.deepEqual(
  anotadas.map((l) => l.cooperadoId),
  ["c-1", "c-2", "c-3"]
);

assert.equal(lastroContagemFila(0, 5), 5, "badge não zera se a última lista tinha notas");
assert.equal(lastroContagemFila(4, 5), 4, "badge acompanha a lista quando há notas");
assert.equal(lastroContagemFila(0, 0), 0);

const fewerWithPix = { ...full, fichaCorrida: full.fichaCorrida.slice(1) };
fewerWithPix.pagamentosCooperado = [pixConfirmado(1)];
assert.equal(
  snapshotConferirPoorerSemProva(fewerWithPix, full),
  false,
  "PIX confirmado autoriza snapshot com menos fichas"
);

const wipeComPix = { ...full, fichaCorrida: [] as FichaCorrida[], pagamentosCooperado: [pixConfirmado(1)] };
assert.equal(
  snapshotConferirPoorerSemProva(wipeComPix, full),
  true,
  "zerar todas as fichas continua snapshot pobre — PIX entra no merge, não apaga o lastro"
);

resetResponsavelPainelIndexCache();
appDataParaConferirLeitura(full);
const comNotaNova = { ...full, fichaCorrida: [] as FichaCorrida[] };
comNotaNova.cooperados = [...full.cooperados, cooperado(10)];
comNotaNova.notasPedido = [
  ...full.notasPedido,
  { ...nota(10), status: "aguardando_conferencia" as const },
];
const leituraNova = appDataParaConferirLeitura(comNotaNova);
assert.equal(leituraNova.fichaCorrida.length, 9, "lastro mantém fichas no sync incompleto");
assert.ok(
  leituraNova.notasPedido.some((n) => n.id === "n-10"),
  "nota nova do cooperado entra mesmo com snapshot pobre de fichas"
);

resetResponsavelPainelIndexCache();
const filaNova = listNotasFilaConferenciaResponsavel(comNotaNova, COOP);
assert.ok(
  filaNova.some((n) => n.id === "n-10"),
  "Conferir lista a nota nova mesmo com lastro de fichas"
);

console.log("ok: conferir leitura contrato v458 — snapshot + lastro + BIC");
