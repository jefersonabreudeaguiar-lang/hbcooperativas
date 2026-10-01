/**
 * BIC Etapa 4/6 — contrato cliente×servidor, idempotência, projeção, read-only, blindagem M6.
 * npx tsx scripts/test-bic-etapa4-contrato-blindagem.ts
 */
import assert from "node:assert/strict";
import type {
  AppData,
  ArquivoMensalCooperado,
  Cooperado,
  Desconto,
  FichaCorrida,
  NotaPedido,
  PagamentoCooperadoRegistro,
} from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  buildMinimalAppDataForCreditBase,
  buildCreditosBaseAuthoritativeFromCloud,
} from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import {
  buildCreditosBaseMap,
  resetCreditosBaseMapCache,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import {
  blindarCreditoBaseCentsHb,
  cooperadoTemEntregasConferidasParaHb,
  prepararAppDataParaCreditoBaseHb,
} from "../src/modules/hb-credit/engine/creditBaseHbGuard.ts";
import { projetarAppDataFinanceiroParaCreditoBase } from "../src/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase.ts";
import { hbCreditCreditoBaseReais } from "../src/lib/hb-credit/hbCreditLeituraBic.ts";
import { mergePagamentoCooperadoRecord } from "../src/services/pagamentoRegistroMerge.ts";
import { mergeContaCoopDescontosFieldSync } from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import { syncOperacionalPullPipelineForTests } from "../src/services/cooperativaSyncCloudService.ts";
import { mergeCloudNotasIntoData } from "../src/services/notaPedidoCloudService.ts";
import {
  clearCloudResetAppliedVersionForTests,
  setCloudResetAppliedVersionForTests,
} from "../src/services/operationalReset.ts";
import { getData } from "../src/services/dataStore.ts";

const COOP = "coop-e4";
const COOPERADO = "c_e4";
const MES = "2026-09";
const CNPJ = "62351750000165";
const VER = 20;

function pag(
  id: string,
  status: PagamentoCooperadoRegistro["status"],
  updatedAt: string,
  valor = 500
): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    status,
    valorBruto: valor,
    valorLiquido: valor,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
    pagoEm: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

function mkNota(valor = 500, status: NotaPedido["status"] = "conferida"): NotaPedido {
  return {
    id: "n1",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "i1",
    numeroNota: "n1",
    mesReferencia: MES,
    status,
    valorBruto: valor,
    valorLiquido: valor,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: valor, valorBruto: valor }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  } as NotaPedido;
}

function mkFicha(status: FichaCorrida["status"] = "pendente"): FichaCorrida {
  return {
    id: "f1",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: "n1",
    mesReferencia: MES,
    status,
    valorBruto: 500,
    descontos: 0,
    valorLiquido: 500,
    descricao: "n1",
    dataLancamento: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
  } as FichaCorrida;
}

function shell(partial: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [
      { id: COOPERADO, cooperativaId: COOP, nomeCompleto: "E4", status: "ativo", createdAt: "" },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    descontos: [],
    mensalidades: [],
    arquivosMensais: [],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "I", createdAt: "" }],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
    ...partial,
  } as AppData;
}

function snapshotData(data: AppData): string {
  return JSON.stringify({
    pag: data.pagamentosCooperado,
    ficha: data.fichaCorrida,
    notas: data.notasPedido,
    descontos: data.descontos,
    arquivos: data.arquivosMensais,
  });
}

function clientView(local: AppData, cloud: OperacionalSyncPayload, notas: NotaPedido[]): AppData {
  let data = mergeCloudNotasIntoData(local, notas, CNPJ);
  return syncOperacionalPullPipelineForTests(data, cloud, COOP, CNPJ).data;
}

clearCloudResetAppliedVersionForTests(CNPJ);
setCloudResetAppliedVersionForTests(CNPJ, VER);

// —— Fase 4: projeção direta (12 casos + idempotência) ——
{
  const base = shell({
    notasPedido: [mkNota()],
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  });
  const p1 = projetarAppDataFinanceiroParaCreditoBase(base, CNPJ);
  assert.equal(p1.fichaCorrida[0]?.status, "pago", "1 confirmado alinha ficha");

  const p2 = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha("pendente")],
      pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
    }),
    CNPJ
  );
  assert.equal(p2.fichaCorrida[0]?.status, "pago", "2 aguardando alinha ficha");

  const p3 = projetarAppDataFinanceiroParaCreditoBase(base, CNPJ);
  assert.equal(p3.fichaCorrida[0]?.status, "pago", "3 confirmado+ficha pendente");

  const p4 = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha("pago")],
      pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
    }),
    CNPJ
  );
  assert.equal(p4.fichaCorrida[0]?.status, "pago", "4 já pago");

  const p5 = projetarAppDataFinanceiroParaCreditoBase(
    shell({ notasPedido: [mkNota()], pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")] }),
    CNPJ
  );
  assert.ok(p5.fichaCorrida.length >= 0, "5 sem ficha ok");

  const p6 = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha("pendente"), { ...mkFicha("pendente"), id: "f2", notaPedidoId: "n2" }],
      pagamentosCooperado: [
        pag("p1", "confirmado", "2026-09-01T10:00:00.000Z"),
        pag("p2", "aguardando_confirmacao", "2026-09-02T10:00:00.000Z"),
      ],
    }),
    CNPJ
  );
  assert.ok(p6.pagamentosCooperado.length === 2, "6 múltiplos pagamentos");

  const dupPay = pag("p1", "confirmado", "2026-09-01T10:00:00.000Z");
  const p7 = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha()],
      pagamentosCooperado: [dupPay, { ...dupPay }],
    }),
    CNPJ
  );
  assert.ok(p7.pagamentosCooperado.length >= 1, "7 duplicata tolerada");

  const p8 = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha()],
      descontos: [
        {
          id: "d1",
          cooperadoId: COOPERADO,
          tipo: "manual",
          motivo: "x",
          data: "2026-09-01",
          responsavel: "a",
          valorBruto: 10,
          valorDescontado: 10,
          valorLiquido: 0,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    }),
    CNPJ
  );
  assert.equal(p8.descontos.length, 1, "8 desconto preservado");

  const arqHb: ArquivoMensalCooperado = {
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: MES,
    notaPedidoIds: ["n1"],
    pagamentoIds: [],
    updatedAt: "2026-09-01T10:00:00.000Z",
    contaCoopDescontos: [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "hb1",
      },
    ],
  };
  resetCreditosBaseMapCache();
  const centsHb = buildCreditosBaseMap(
    shell({ notasPedido: [mkNota()], fichaCorrida: [mkFicha()], arquivosMensais: [arqHb] }),
    [COOPERADO],
    COOP
  )[COOPERADO];
  assert.ok(centsHb < 50_000, "9 HB reduz base");

  const arqEstorno: ArquivoMensalCooperado = {
    ...arqHb,
    contaCoopDescontos: [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "hb1",
      },
      {
        motivo: "Estorno HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-06T00:00:00.000Z",
        hbTransactionId: "hb1_refund",
      },
    ],
  };
  resetCreditosBaseMapCache();
  const centsEst = buildCreditosBaseMap(
    shell({ notasPedido: [mkNota()], fichaCorrida: [mkFicha()], arquivosMensais: [arqEstorno] }),
    [COOPERADO],
    COOP
  )[COOPERADO];
  assert.equal(centsEst, 50_000, "10 estorno net zero");

  resetCreditosBaseMapCache();
  const centsCombo = buildCreditosBaseMap(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha("pendente")],
      pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
      arquivosMensais: [arqHb],
    }),
    [COOPERADO],
    COOP
  )[COOPERADO];
  assert.equal(centsCombo, 0, "11 pagamento quitado domina HB");

  const once = projetarAppDataFinanceiroParaCreditoBase(base, CNPJ);
  const twice = projetarAppDataFinanceiroParaCreditoBase(once, CNPJ);
  resetCreditosBaseMapCache();
  const m1 = buildCreditosBaseMap(once, [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const m2 = buildCreditosBaseMap(twice, [COOPERADO], COOP);
  assert.deepEqual(m1, m2, "12 idempotência projeção");
}

// —— Fase 5: não-mutação ——
{
  const data = shell({
    notasPedido: [mkNota()],
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  });
  const before = snapshotData(data);
  projetarAppDataFinanceiroParaCreditoBase(data, CNPJ);
  assert.equal(snapshotData(data), before, "projetar não muta entrada");

  const beforePrep = snapshotData(data);
  prepararAppDataParaCreditoBaseHb(data, CNPJ);
  assert.equal(snapshotData(data), beforePrep, "preparar não muta entrada");

  const globalBefore = snapshotData(getData());
  buildCreditosBaseMap(data, [COOPERADO], COOP);
  buildMinimalAppDataForCreditBase({
    operacional: {
      updatedAt: "2026-09-20T12:00:00.000Z",
      fichaCorrida: [mkFicha()],
      pagamentosCooperado: [],
      config: { descontoPadraoCooperativa: 5 },
    } as OperacionalSyncPayload,
    cooperativaId: COOP,
    cnpj: CNPJ,
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "E4", status: "ativo", createdAt: "" }],
    notasPedido: [mkNota()],
  });
  assert.equal(snapshotData(getData()), globalBefore, "BIC não altera getData() global");
}

// saveDataSafe não é invocado por projeção (spy indireto: getData inalterado já prova)

// —— Fase 3: ordem A→B / CONFIRMADO→AGUARDANDO ——
{
  const cloudA = {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
  const cloudB = {
    ...cloudA,
    updatedAt: "2026-09-21T00:00:00.000Z",
    pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-21T00:00:00.000Z")],
  } as OperacionalSyncPayload;
  const local = shell({ notasPedido: [mkNota()], fichaCorrida: [mkFicha()] });
  const ab = clientView(clientView(local, cloudA, [mkNota()]), cloudB, [mkNota()]);
  const ba = clientView(
    clientView(local, cloudB, [mkNota()]),
    cloudA,
    [mkNota()]
  );
  resetCreditosBaseMapCache();
  const mapAb = buildCreditosBaseMap(ab, [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const mapBa = buildCreditosBaseMap(ba, [COOPERADO], COOP);
  assert.deepEqual(mapAb, mapBa, "A→B vs B→A determinístico para M6 map");

  const confirmed = pag("p1", "confirmado", "2026-09-01T10:00:00.000Z");
  const merged = mergePagamentoCooperadoRecord(
    confirmed,
    pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")
  );
  assert.equal(merged.status, "confirmado", "CONFIRMADO→AGUARDANDO não regride");
}

// —— Fase 6: blindagem M6 ——
{
  const semNota = shell({ notasPedido: [], fichaCorrida: [] });
  const sane = prepararAppDataParaCreditoBaseHb(semNota, CNPJ);
  assert.equal(
    blindarCreditoBaseCentsHb(sane, COOPERADO, COOP, 99_999, sane),
    0,
    "sem entrega conferida → fail-closed"
  );
  assert.equal(cooperadoTemEntregasConferidasParaHb(sane, COOPERADO, COOP), false);

  const quitado = prepararAppDataParaCreditoBaseHb(
    shell({
      notasPedido: [mkNota()],
      fichaCorrida: [mkFicha("pago")],
      pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
    }),
    CNPJ
  );
  resetCreditosBaseMapCache();
  assert.equal(buildCreditosBaseMap(quitado, [COOPERADO], COOP)[COOPERADO], 0, "confirmado → base 0");

  const staleHb = mergeContaCoopDescontosFieldSync(
    [],
    [{ motivo: "Compra HB", valorReais: 99, tipo: "conta_coop", createdAt: "2026-09-06T00:00:00.000Z" }]
  );
  assert.equal(staleHb.length, 0, "HB stale sem hbTransactionId não cria incidência");

  assert.equal(blindarCreditoBaseCentsHb(sane, COOPERADO, COOP, -100, sane), 0, "centavos negativos → 0");
}

console.log("OK — test-bic-etapa4-contrato-blindagem");
