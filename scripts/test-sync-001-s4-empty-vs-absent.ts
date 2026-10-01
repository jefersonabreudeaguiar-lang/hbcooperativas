/**
 * SYNC-001/S4 — [] vs ausente vs snapshot parcial (in-memory).
 * npx tsx scripts/test-sync-001-s4-empty-vs-absent.ts
 */
import assert from "node:assert/strict";
import type { AppData, Desconto, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  aplicarOperacionalPullLocalForTests,
  avaliarFullResetOperacionalPullSeguro,
  operacionalColecoesReplaceAutoritativo,
} from "../src/services/cooperativaSyncCloudService.ts";
import {
  operacionalColecaoReplaceDominio,
  operacionalDominioFornecidoNoPayload,
} from "../src/services/operacionalMergeSemantics.ts";
import {
  markContaCoopDescontosFetchFailed,
  clearContaCoopDescontosMesFetchAutoritativo,
} from "../src/lib/hb-credit/contaCoopDescontosSyncHealth.ts";
import {
  setContaCoopDescontosMemoria,
} from "../src/lib/hb-credit/contaCoopDescontosMemory.ts";
import { liquidoUsoContaCoopMes } from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import { getDescontosContaCoopMesCached } from "../src/services/notaPedidoService.ts";

const COOP = "coop-s4";
const COOPERADO = "c_s4";
const MES = "2026-09";
const CNPJ = "62351750000165";

function pag(id: string): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    status: "aguardando_confirmacao",
    valorBruto: 100,
    valorLiquido: 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: [],
    notaPedidoIds: [],
    pagoPor: "R",
    pagoEm: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function desconto(id: string): Desconto {
  return {
    id,
    cooperadoId: COOPERADO,
    tipo: "manual",
    motivo: "M",
    data: "2026-09-05",
    responsavel: "a",
    valorBruto: 10,
    valorDescontado: 10,
    valorLiquido: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function mkNota(id: string): NotaPedido {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "inst-1",
    numeroNota: id,
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 100,
    valorLiquido: 100,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 100, valorBruto: 100 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  } as NotaPedido;
}

function mkFicha(id: string, notaId: string): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: notaId,
    descricao: notaId,
    mesReferencia: MES,
    status: "pendente",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    saldoAcumulado: 0,
    dataLancamento: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
  } as FichaCorrida;
}

function appComConferidas(
  pagamentos: PagamentoCooperadoRegistro[],
  descontos: Desconto[]
): AppData {
  const nota = mkNota("n_s4");
  return {
    ...baseApp(pagamentos, descontos),
    notasPedido: [nota],
    fichaCorrida: [mkFicha("f_s4", "n_s4")],
    instituicoes: [{ id: "inst-1", cooperativaId: COOP, nome: "I", createdAt: "" }],
  } as AppData;
}

function cloudFullResetAligned(descontosCloud: Desconto[], extra?: Partial<OperacionalSyncPayload>): OperacionalSyncPayload {
  return cloudBase({
    fullReset: true,
    operacionalSnapshotComplete: true,
    operationalResetVersion: 20,
    fichaCorrida: [mkFicha("f_s4c", "n_s4")],
    pagamentosCooperado: [],
    descontos: descontosCloud,
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    ...extra,
  });
}

function baseApp(
  pagamentos: PagamentoCooperadoRegistro[],
  descontos: Desconto[] = []
): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "S4", status: "ativo", createdAt: "" }],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: pagamentos,
    descontos,
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

function cloudBase(extra: Record<string, unknown>): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-20T12:00:00.000Z",
    operationalResetVersion: 15,
    config: { descontoPadraoCooperativa: 5 },
    ...extra,
  } as OperacionalSyncPayload;
}

function mergePull(before: AppData, cloud: OperacionalSyncPayload): AppData {
  return aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ).data;
}

function coopPagamentos(data: AppData): PagamentoCooperadoRegistro[] {
  return data.pagamentosCooperado.filter((p) => p.cooperativaId === COOP);
}

function coopDescontos(data: AppData): Desconto[] {
  return data.descontos.filter((d) => d.cooperadoId === COOPERADO);
}

// 1) pagamentos ausentes
{
  const before = baseApp([pag("p1"), pag("p2"), pag("p3")]);
  const after = mergePull(before, cloudBase({ fichaCorrida: [] }));
  assert.equal(coopPagamentos(after).length, 3);
  assert.ok(!operacionalDominioFornecidoNoPayload(cloudBase({ fichaCorrida: [] }), "pagamentosCooperado"));
}

// 2) pagamentos [] snapshotComplete false
{
  const after = mergePull(
    baseApp([pag("p1"), pag("p2"), pag("p3")]),
    cloudBase({ pagamentosCooperado: [], fichaCorrida: [], fullReset: true })
  );
  assert.equal(coopPagamentos(after).length, 3);
}

// 3) descontos [] snapshotComplete false
{
  const after = mergePull(
    baseApp([], [desconto("d1"), desconto("d2"), desconto("d3")]),
    cloudBase({ descontos: [], fichaCorrida: [], fullReset: true })
  );
  assert.equal(coopDescontos(after).length, 3);
}

// 4) pagamentos [] snapshotComplete true — política S1/S3 (merge pagamentos, não replace cego)
{
  const confirmado = { ...pag("p_ok"), status: "confirmado" as const };
  const after = mergePull(
    baseApp([confirmado]),
    cloudBase({
      pagamentosCooperado: [],
      fichaCorrida: [],
      fullReset: true,
      operacionalSnapshotComplete: true,
      operationalResetVersion: 20,
    })
  );
  assert.ok(coopPagamentos(after).some((p) => p.id === "p_ok" && p.status === "confirmado"));
}

// 5) descontos ausente + snapshotComplete true
{
  const after = mergePull(
    baseApp([], [desconto("d1"), desconto("d2"), desconto("d3")]),
    cloudBase({
      fichaCorrida: [],
      fullReset: true,
      operacionalSnapshotComplete: true,
      operationalResetVersion: 20,
    })
  );
  assert.equal(coopDescontos(after).length, 3);
}

// 6) parcial: pagamentos sim, descontos ausente
{
  const after = mergePull(
    baseApp([pag("p1")], [desconto("d1"), desconto("d2"), desconto("d3")]),
    cloudBase({
      pagamentosCooperado: [pag("p_cloud")],
      fichaCorrida: [],
    })
  );
  assert.ok(coopPagamentos(after).some((p) => p.id === "p_cloud"));
  assert.equal(coopDescontos(after).length, 3);
}

// 7) fetch falhou — HB não zera arquivo local
{
  clearContaCoopDescontosMesFetchAutoritativo(COOP, COOPERADO, MES);
  let data = baseApp([]);
  data = {
    ...data,
    arquivosMensais: [
      {
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        mesReferencia: MES,
        notaPedidoIds: [],
        pagamentoIds: [],
        updatedAt: "2026-09-01T00:00:00.000Z",
        contaCoopDescontos: [
          {
            motivo: "Compra HB",
            valorReais: 40,
            tipo: "conta_coop",
            createdAt: "2026-09-05T00:00:00.000Z",
          },
        ],
      },
    ],
  };
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, []);
  markContaCoopDescontosFetchFailed(COOP, COOPERADO, "offline", MES);
  assert.equal(liquidoUsoContaCoopMes(getDescontosContaCoopMesCached(data, COOPERADO, MES, COOP)), 40);
}

// 8) payload {}
{
  const after = mergePull(
    baseApp([pag("p1")], [desconto("d1")]),
    cloudBase({}) as OperacionalSyncPayload
  );
  assert.equal(coopPagamentos(after).length, 1);
  assert.equal(coopDescontos(after).length, 1);
}

// 9) ambos [] snapshotComplete false
{
  const after = mergePull(
    baseApp([pag("p1")], [desconto("d1")]),
    cloudBase({ pagamentosCooperado: [], descontos: [], fichaCorrida: [], fullReset: true })
  );
  assert.equal(coopPagamentos(after).length, 1);
  assert.equal(coopDescontos(after).length, 1);
}

// 10) snapshot completo legítimo (S1) — descontos [] fornecido zera quando pull autorizado
{
  const before = appComConferidas([], [desconto("d1")]);
  const cloud = cloudFullResetAligned([]);
  const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
  assert.ok(seguro.permitirMergeAutoritativo);
  const colecoesReplace = operacionalColecoesReplaceAutoritativo(
    seguro.permitirMergeAutoritativo,
    cloud,
    seguro
  );
  assert.ok(colecoesReplace);
  assert.ok(operacionalColecaoReplaceDominio(colecoesReplace, cloud, "descontos", false));
  const after = mergePull(before, cloud);
  assert.equal(coopDescontos(after).length, 0);
}

// 11) snapshot completo com dados
{
  const after = mergePull(
    baseApp([], [desconto("d_local")]),
    cloudBase({
      descontos: [desconto("d_cloud")],
      pagamentosCooperado: [pag("p_cloud")],
      fichaCorrida: [],
      operacionalSnapshotComplete: true,
      fullReset: true,
      operationalResetVersion: 20,
    })
  );
  assert.ok(coopDescontos(after).some((d) => d.id === "d_cloud"));
  assert.ok(coopPagamentos(after).some((p) => p.id === "p_cloud"));
}

// 12) completo A depois parcial B
{
  const full = mergePull(
    baseApp([pag("p1")], [desconto("d1"), desconto("d2")]),
    cloudBase({
      descontos: [desconto("d_cloud")],
      pagamentosCooperado: [pag("p_cloud")],
      fichaCorrida: [],
      operacionalSnapshotComplete: true,
      fullReset: true,
      operationalResetVersion: 20,
    })
  );
  const partial = mergePull(
    full,
    cloudBase({
      pagamentosCooperado: [pag("p_new")],
      fichaCorrida: [],
      updatedAt: "2026-09-21T00:00:00.000Z",
    })
  );
  assert.ok(coopDescontos(partial).some((d) => d.id === "d_cloud"));
  assert.ok(coopPagamentos(partial).some((p) => p.id === "p_new"));
}

console.log("OK — test-sync-001-s4-empty-vs-absent");
