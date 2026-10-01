/**
 * SYNC-001/S5 — autoridade semântica vs updatedAt (in-memory).
 * npx tsx scripts/test-sync-001-s5-semantic-authority.ts
 */
import assert from "node:assert/strict";
import type {
  AppData,
  ArquivoMensalCooperado,
  Desconto,
  FichaCorrida,
  NotaPedido,
  PagamentoCooperadoRegistro,
} from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  aplicarOperacionalPullLocalForTests,
  avaliarFullResetOperacionalPullSeguro,
  mergeOperacionalIntoData,
  operacionalColecoesReplaceAutoritativo,
} from "../src/services/cooperativaSyncCloudService.ts";
import {
  mergePagamentoCooperadoRecord,
  mergePagamentosCooperadoFromCloud,
} from "../src/services/pagamentoRegistroMerge.ts";
import { mergeNotaComFotos } from "../src/utils/fotoEntrega.ts";
import {
  liquidoUsoContaCoopMes,
  mergeContaCoopDescontosFieldSync,
} from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import { mergeArquivosMensaisFromCloud } from "../src/services/notaPedidoService.ts";
import { operacionalColecaoReplaceDominio } from "../src/services/operacionalMergeSemantics.ts";

const COOP = "coop-s5";
const COOPERADO = "c_s5";
const MES = "2026-09";
const CNPJ = "62351750000165";

const PULL_AUTORITATIVO = {
  permitirClearFinanceiro: true,
  permitirCloudAuthoritative: true,
  permitirMergeAutoritativo: true,
  permitirAplicarResetLegado: true,
  motivo: "s5-test",
} as const;

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
    valorBruto: 100,
    valorLiquido: 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f_s5"],
    notaPedidoIds: ["n_s5"],
    pagoEm: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

function baseApp(extra: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "S5", status: "ativo", createdAt: "" }],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    descontos: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
    ...extra,
  } as AppData;
}

function cloudSlice(extra: Record<string, unknown>): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-20T12:00:00.000Z",
    operationalResetVersion: 15,
    config: { descontoPadraoCooperativa: 5 },
    fichaCorrida: [],
    ...extra,
  } as OperacionalSyncPayload;
}

function coopPag(data: AppData, id: string): PagamentoCooperadoRegistro | undefined {
  return data.pagamentosCooperado.find((p) => p.id === id);
}

function coopDescontos(data: AppData): Desconto[] {
  return data.descontos.filter((d) => d.cooperadoId === COOPERADO);
}

function mkNota(overrides: Partial<NotaPedido> = {}): NotaPedido {
  return {
    id: "n_s5",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "i1",
    numeroNota: "1",
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 100,
    valorLiquido: 100,
    itens: [{ produtoId: "p1", quantidade: 10, valorUnitario: 10, valorTotal: 100 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  } as NotaPedido;
}

function mkFicha(status: FichaCorrida["status"], updatedAt: string): FichaCorrida {
  return {
    id: "f_s5",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: "n_s5",
    mesReferencia: MES,
    status,
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    descricao: "n_s5",
    dataLancamento: "2026-09-01",
    createdAt: updatedAt,
    updatedAt,
  } as FichaCorrida;
}

function mkNotaConferidaApp(
  ficha: FichaCorrida,
  pagamentos: PagamentoCooperadoRegistro[],
  descontos: Desconto[] = []
): AppData {
  return baseApp({
    notasPedido: [mkNota()],
    fichaCorrida: [ficha],
    pagamentosCooperado: pagamentos,
    descontos,
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "I", createdAt: "" }],
  });
}

function cloudFullResetAligned(extra: Partial<OperacionalSyncPayload>): OperacionalSyncPayload {
  return cloudSlice({
    fullReset: true,
    operacionalSnapshotComplete: true,
    operationalResetVersion: 20,
    fichaCorrida: [mkFicha("pendente", "2026-09-15T00:00:00.000Z")],
    pagamentosCooperado: [],
    descontos: [],
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    ...extra,
  });
}

// 1) confirmado local × aguardando cloud mais novo
{
  const local = pag("p1", "confirmado", "2026-09-01T10:00:00.000Z");
  const cloud = pag("p1", "aguardando_confirmacao", "2026-09-01T11:00:00.000Z");
  const m = mergePagamentoCooperadoRecord(local, cloud);
  assert.equal(m.status, "confirmado");
}

// 2) aguardando local × confirmado cloud mais antigo
{
  const local = pag("p1", "aguardando_confirmacao", "2026-09-01T10:00:00.000Z");
  const cloud = pag("p1", "confirmado", "2026-09-01T09:00:00.000Z");
  const m = mergePagamentoCooperadoRecord(local, cloud);
  assert.equal(m.status, "confirmado");
}

// 3) NOT-001 — nota completa local × cloud incompleta mais nova
{
  const local = mkNota({ updatedAt: "2026-09-01T10:00:00.000Z" });
  const cloud = mkNota({
    updatedAt: "2026-09-01T12:00:00.000Z",
    itens: [],
    valorBruto: 0,
    valorLiquido: 0,
  });
  const m = mergeNotaComFotos(local, cloud);
  assert.equal(m.itens?.length, 1);
  assert.equal(m.valorLiquido, 100);
}

// 4) HB — incidência local × linha cloud sem hbTransactionId mais nova
{
  const local = [
    {
      motivo: "Compra HB",
      valorReais: 40,
      tipo: "conta_coop" as const,
      createdAt: "2026-09-05T00:00:00.000Z",
      hbTransactionId: "hb_sql_1",
    },
  ];
  const cloud = [
    {
      motivo: "Compra HB",
      valorReais: 40,
      tipo: "conta_coop" as const,
      createdAt: "2026-09-06T00:00:00.000Z",
    },
  ];
  const merged = mergeContaCoopDescontosFieldSync(local, cloud);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].hbTransactionId, "hb_sql_1");
}

// 5) ficha pago local × pendente cloud mais nova (via merge operacional)
{
  const before = mkNotaConferidaApp(
    mkFicha("pago", "2026-09-01T10:00:00.000Z"),
    [pag("p_ok", "confirmado", "2026-09-01T10:00:00.000Z")]
  );
  const after = mergeOperacionalIntoData(
    before,
    cloudSlice({
      fichaCorrida: [mkFicha("pendente", "2026-09-01T12:00:00.000Z")],
    }),
    COOP
  );
  const f = after.fichaCorrida.find((x) => x.id === "f_s5");
  assert.equal(f?.status, "pago");
}

// 6) coleção [] sem snapshot completo — S4
{
  const after = aplicarOperacionalPullLocalForTests(
    baseApp({ descontos: [{ id: "d1", cooperadoId: COOPERADO, tipo: "manual", motivo: "m", data: "2026-09-01", responsavel: "a", valorBruto: 1, valorDescontado: 1, valorLiquido: 0, createdAt: "" }] }),
    cloudSlice({ descontos: [], fullReset: true }),
    COOP,
    CNPJ
  ).data;
  assert.equal(coopDescontos(after).length, 1);
}

// 7) coleção [] replace autorizado — S1/S4
{
  const before = mkNotaConferidaApp(mkFicha("pendente", "2026-09-01T00:00:00.000Z"), [], [
    {
      id: "d1",
      cooperadoId: COOPERADO,
      tipo: "manual",
      motivo: "m",
      data: "2026-09-01",
      responsavel: "a",
      valorBruto: 1,
      valorDescontado: 1,
      valorLiquido: 0,
      createdAt: "",
    },
  ]);
  const cloud = cloudFullResetAligned({ descontos: [] });
  const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
  assert.ok(operacionalColecoesReplaceAutoritativo(seguro.permitirMergeAutoritativo, cloud, seguro));
  assert.ok(operacionalColecaoReplaceDominio(true, cloud, "descontos", false));
  const after = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ).data;
  assert.equal(coopDescontos(after).length, 0);
}

// 8) mesmo domínio sem conflito semântico — cloud mais novo vence (desconto)
{
  const localD: Desconto = {
    id: "d_tie",
    cooperadoId: COOPERADO,
    tipo: "manual",
    motivo: "local",
    data: "2026-09-01",
    responsavel: "a",
    valorBruto: 10,
    valorDescontado: 10,
    valorLiquido: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
  const cloudD: Desconto = {
    ...localD,
    motivo: "cloud",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
  const after = mergeOperacionalIntoData(
    baseApp({ descontos: [localD] }),
    cloudSlice({ descontos: [cloudD] }),
    COOP
  );
  assert.equal(coopDescontos(after)[0]?.motivo, "cloud");
}

// 9) fullReset completo — confirmado local não rebaixa por aguardando mais novo
{
  const before = mkNotaConferidaApp(
    mkFicha("pago", "2026-09-01T10:00:00.000Z"),
    [pag("p_fr", "confirmado", "2026-09-01T10:00:00.000Z")]
  );
  const cloud = cloudFullResetAligned({
    pagamentosCooperado: [pag("p_fr", "aguardando_confirmacao", "2026-09-01T12:00:00.000Z")],
  });
  const after = mergeOperacionalIntoData(before, cloud, COOP, [], PULL_AUTORITATIVO);
  assert.equal(coopPag(after, "p_fr")?.status, "confirmado");
}

// 10) ordem A→B — parcial B não apaga domínio ausente
{
  const full = mergeOperacionalIntoData(
    mkNotaConferidaApp(mkFicha("pendente", "2026-09-01T00:00:00.000Z"), [], [
      {
        id: "d_keep",
        cooperadoId: COOPERADO,
        tipo: "manual",
        motivo: "keep",
        data: "2026-09-01",
        responsavel: "a",
        valorBruto: 1,
        valorDescontado: 1,
        valorLiquido: 0,
        createdAt: "",
      },
    ]),
    cloudFullResetAligned({
      descontos: [{ id: "d_cloud", cooperadoId: COOPERADO, tipo: "manual", motivo: "c", data: "2026-09-02", responsavel: "a", valorBruto: 2, valorDescontado: 2, valorLiquido: 0, createdAt: "" }],
      pagamentosCooperado: [pag("p_cloud", "aguardando_confirmacao", "2026-09-01T11:00:00.000Z")],
    }),
    COOP,
    [],
    PULL_AUTORITATIVO
  );
  const partial = mergeOperacionalIntoData(
    full,
    cloudSlice({
      updatedAt: "2026-09-21T00:00:00.000Z",
      pagamentosCooperado: [pag("p_new", "aguardando_confirmacao", "2026-09-21T00:00:00.000Z")],
    }),
    COOP
  );
  assert.ok(coopDescontos(partial).some((d) => d.id === "d_cloud"));
  assert.ok(partial.pagamentosCooperado.some((p) => p.id === "p_new"));
}

// 11) ordem B→A — parcial primeiro, full depois, sem regressão de confirmado
{
  const seed = mkNotaConferidaApp(
    mkFicha("pago", "2026-09-01T10:00:00.000Z"),
    [pag("p_ord", "confirmado", "2026-09-01T10:00:00.000Z")]
  );
  const partialFirst = mergeOperacionalIntoData(
    seed,
    cloudSlice({
      pagamentosCooperado: [pag("p_ord", "aguardando_confirmacao", "2026-09-01T12:00:00.000Z")],
    }),
    COOP
  );
  assert.equal(coopPag(partialFirst, "p_ord")?.status, "confirmado");
  const thenFull = mergeOperacionalIntoData(
    partialFirst,
    cloudFullResetAligned({
      pagamentosCooperado: [pag("p_ord", "aguardando_confirmacao", "2026-09-01T13:00:00.000Z")],
    }),
    COOP,
    [],
    PULL_AUTORITATIVO
  );
  assert.equal(coopPag(thenFull, "p_ord")?.status, "confirmado");
}

// 12) idempotência — mesmo snapshot aplicado duas vezes
{
  const before = baseApp({
    descontos: [
      {
        id: "d_idem",
        cooperadoId: COOPERADO,
        tipo: "manual",
        motivo: "x",
        data: "2026-09-01",
        responsavel: "a",
        valorBruto: 5,
        valorDescontado: 5,
        valorLiquido: 0,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  });
  const cloud = cloudSlice({
    descontos: [
      {
        id: "d_idem",
        cooperadoId: COOPERADO,
        tipo: "manual",
        motivo: "x",
        data: "2026-09-01",
        responsavel: "a",
        valorBruto: 5,
        valorDescontado: 5,
        valorLiquido: 0,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  });
  const once = mergeOperacionalIntoData(before, cloud, COOP);
  const twice = mergeOperacionalIntoData(once, cloud, COOP);
  assert.equal(coopDescontos(twice).length, coopDescontos(once).length);
  assert.deepEqual(coopDescontos(twice), coopDescontos(once));
}

// HB via arquivo mensal — cloud operacional não duplica incidência
{
  const data = baseApp({
    arquivosMensais: [
      {
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        mesReferencia: MES,
        notaPedidoIds: [],
        pagamentoIds: [],
        updatedAt: "2026-09-01T10:00:00.000Z",
        contaCoopDescontos: [
          {
            motivo: "Compra HB",
            valorReais: 40,
            tipo: "conta_coop",
            createdAt: "2026-09-05T00:00:00.000Z",
            hbTransactionId: "hb_sql_1",
          },
        ],
      },
    ],
  });
  const cloudArquivo: ArquivoMensalCooperado = {
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: MES,
    notaPedidoIds: [],
    pagamentoIds: [],
    updatedAt: "2026-09-06T12:00:00.000Z",
    contaCoopDescontos: [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-06T00:00:00.000Z",
      },
    ],
  };
  const localCoop = data.arquivosMensais.filter((a) => a.cooperativaId === COOP);
  const merged = mergeArquivosMensaisFromCloud(data, localCoop, [cloudArquivo]);
  const arq = merged[0];
  assert.equal(liquidoUsoContaCoopMes(arq.contaCoopDescontos ?? []), 40);
}

// mergePagamentosCooperadoFromCloud idempotente
{
  const local = [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")];
  const cloud = [pag("p1", "aguardando_confirmacao", "2026-09-01T11:00:00.000Z")];
  const m1 = mergePagamentosCooperadoFromCloud(local, cloud);
  const m2 = mergePagamentosCooperadoFromCloud(m1, cloud);
  assert.deepEqual(m1, m2);
}

console.log("OK — test-sync-001-s5-semantic-authority");
