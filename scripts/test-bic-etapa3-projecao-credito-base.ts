/**
 * BIC Etapa 3/6 — projeção financeira compartilhada para crédito-base M6.
 * npx tsx scripts/test-bic-etapa3-projecao-credito-base.ts
 */
import assert from "node:assert/strict";
import type {
  AppData,
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
import { projetarAppDataFinanceiroParaCreditoBase } from "../src/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase.ts";
import { prepararAppDataParaCreditoBaseHb } from "../src/modules/hb-credit/engine/creditBaseHbGuard.ts";
import { posProcessarFinanceiroLocal } from "../src/services/operacionalLocalPostProcess.ts";
import { syncOperacionalPullPipelineForTests } from "../src/services/cooperativaSyncCloudService.ts";
import { mergeCloudNotasIntoData } from "../src/services/notaPedidoCloudService.ts";
import { mergePagamentoCooperadoRecord } from "../src/services/pagamentoRegistroMerge.ts";
import {
  clearCloudResetAppliedVersionForTests,
  setCloudResetAppliedVersionForTests,
  setOperacionalCloudAuthoritativeForTests,
} from "../src/services/operationalReset.ts";

const COOP = "coop-e3";
const COOPERADO = "c_e3";
const MES = "2026-09";
const CNPJ = "62351750000165";
const VER = 20;

function pag(
  id: string,
  status: PagamentoCooperadoRegistro["status"],
  updatedAt: string
): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    status,
    valorBruto: 500,
    valorLiquido: 500,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
    pagoEm: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

function mkNota(): NotaPedido {
  return {
    id: "n1",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "i1",
    numeroNota: "n1",
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 500,
    valorLiquido: 500,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500, valorBruto: 500 }],
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

function desconto(id: string, valor = 10): Desconto {
  return {
    id,
    cooperadoId: COOPERADO,
    tipo: "manual",
    motivo: "M",
    data: "2026-09-01",
    responsavel: "a",
    valorBruto: valor,
    valorDescontado: valor,
    valorLiquido: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function cooperados(): Cooperado[] {
  return [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "E3", status: "ativo", createdAt: "" }];
}

function shell(local: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: cooperados(),
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
    ...local,
  } as AppData;
}

function clientAfterSync(local: AppData, cloud: OperacionalSyncPayload, notas: NotaPedido[]): AppData {
  let data = mergeCloudNotasIntoData(local, notas, CNPJ);
  return syncOperacionalPullPipelineForTests(data, cloud, COOP, CNPJ).data;
}

function serverCents(cloud: OperacionalSyncPayload, notas: NotaPedido[]): number {
  resetCreditosBaseMapCache();
  const map = buildCreditosBaseAuthoritativeFromCloud(
    cloud,
    COOP,
    CNPJ,
    [COOPERADO],
    cooperados(),
    notas
  );
  return map[COOPERADO] ?? 0;
}

clearCloudResetAppliedVersionForTests(CNPJ);
setCloudResetAppliedVersionForTests(CNPJ, VER);
setOperacionalCloudAuthoritativeForTests(null);

const notas = [mkNota()];

{
  resetCreditosBaseMapCache();
  const localProj = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: notas,
      fichaCorrida: [mkFicha("pendente")],
      pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
    }),
    CNPJ
  );
  const clientCents = buildCreditosBaseMap(localProj, [COOPERADO], COOP)[COOPERADO] ?? 0;
  const cloudAguardando = {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
  const server = serverCents(cloudAguardando, notas);
  assert.equal(clientCents, 0, "T3b cliente base 0 após projeção");
  assert.equal(server, 0, "T3b servidor base 0 após projeção");
  assert.equal(clientCents, server, "T3b paridade");
}

{
  const data = shell({
    notasPedido: notas,
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  });
  resetCreditosBaseMapCache();
  const viaPos = buildCreditosBaseMap(posProcessarFinanceiroLocal(data, CNPJ), [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const viaProj = buildCreditosBaseMap(projetarAppDataFinanceiroParaCreditoBase(data, CNPJ), [COOPERADO], COOP);
  assert.deepEqual(viaPos, viaProj);
}

{
  const data = clientAfterSync(
    shell({
      notasPedido: notas,
      fichaCorrida: [mkFicha()],
      pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
    }),
    {
      updatedAt: "2026-09-20T12:00:00.000Z",
      fullReset: true,
      operationalResetVersion: VER,
      fichaCorrida: [mkFicha("pendente")],
      pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
      config: { descontoPadraoCooperativa: 5 },
    } as OperacionalSyncPayload,
    notas
  );
  resetCreditosBaseMapCache();
  const m1 = buildCreditosBaseMap(data, [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const m2 = buildCreditosBaseMap(prepararAppDataParaCreditoBaseHb(data, CNPJ), [COOPERADO], COOP);
  assert.deepEqual(m1, m2);
}

{
  const cloud = {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    operacionalSnapshotComplete: true,
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
  const local = clientAfterSync(shell({ notasPedido: notas, fichaCorrida: [mkFicha()] }), cloud, notas);
  resetCreditosBaseMapCache();
  const client = buildCreditosBaseMap(local, [COOPERADO], COOP)[COOPERADO] ?? 0;
  const server = serverCents(cloud, notas);
  assert.equal(client, server, "T10 paridade");
}

{
  const cloud = {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
  const local = clientAfterSync(
    shell({ notasPedido: notas, fichaCorrida: [mkFicha()], descontos: [desconto("d1")] }),
    cloud,
    notas
  );
  resetCreditosBaseMapCache();
  const client = buildCreditosBaseMap(local, [COOPERADO], COOP)[COOPERADO] ?? 0;
  const server = serverCents(cloud, notas);
  assert.ok(client < server, "T9 limitação factual");
}

{
  const local = pag("p1", "confirmado", "2026-09-01T10:00:00.000Z");
  const cloud = pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z");
  assert.equal(mergePagamentoCooperadoRecord(local, cloud).status, "confirmado");
}

console.log("OK — test-bic-etapa3-projecao-credito-base");
