/**
 * SYNC-001/R1 — restore legado sem clear preemptivo fora de autoridade S1.
 * npx tsx scripts/test-sync-001-r1-restore-safe.ts
 */
import assert from "node:assert/strict";
import type {
  AppData,
  ArquivoMensalCooperado,
  Desconto,
  FichaCorrida,
  MensalidadeCooperado,
  NotaPedido,
  PagamentoCooperadoRegistro,
} from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  aplicarRestoreLegadoOperacionalForTests,
  operacionalRestorePreemptiveClearPermitido,
  syncOperacionalPullPipelineForTests,
} from "../src/services/cooperativaSyncCloudService.ts";
import {
  applyCloudOperationalResetIfNeeded,
  clearCloudResetAppliedVersionForTests,
  reapplyCloudOperationalSliceIfStale,
  setCloudResetAppliedVersionForTests,
  setRestoreLegacyBypassWindowForTests,
} from "../src/services/operationalReset.ts";

const COOP = "coop-r1";
const COOPERADO = "c_r1";
const MES = "2026-09";
const CNPJ = "62351750000165";
const VER = 20;

function pag(id: string, status: PagamentoCooperadoRegistro["status"], updatedAt: string): PagamentoCooperadoRegistro {
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
    fichaIds: ["f_r1"],
    notaPedidoIds: ["n_r1"],
    pagoEm: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

function mkNota(): NotaPedido {
  return {
    id: "n_r1",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "i1",
    numeroNota: "1",
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 100,
    valorLiquido: 100,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 100, valorBruto: 100 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  } as NotaPedido;
}

function mkFicha(id = "f_r1"): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: "n_r1",
    mesReferencia: MES,
    status: "pendente",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    descricao: "n_r1",
    dataLancamento: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
  } as FichaCorrida;
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

function mensalidade(id: string): MensalidadeCooperado {
  return {
    id,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    valor: 30,
    status: "pendente",
    createdAt: "2026-09-01T00:00:00.000Z",
  } as MensalidadeCooperado;
}

function arquivo(): ArquivoMensalCooperado {
  return {
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: MES,
    notaPedidoIds: ["n_r1"],
    pagamentoIds: [],
    updatedAt: "2026-09-01T10:00:00.000Z",
    contaCoopDescontos: [
      {
        motivo: "Compra HB",
        valorReais: 25,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "hb_r1",
      },
    ],
  };
}

function richLocal(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "R1", status: "ativo", createdAt: "" }],
    users: [],
    notasPedido: [mkNota()],
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [pag("p_conf", "confirmado", "2026-09-01T10:00:00.000Z")],
    descontos: [desconto("d1"), desconto("d2")],
    mensalidades: [mensalidade("m1")],
    arquivosMensais: [arquivo()],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "I", createdAt: "" }],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

function cloudPartialMisaligned(): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    fichaCorrida: [mkFicha("f_cloud")],
    pagamentosCooperado: [pag("p_cloud", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
}

function cloudFullAuthorized(extra?: Partial<OperacionalSyncPayload>): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    operacionalSnapshotComplete: true,
    fichaCorrida: [mkFicha("f_cloud")],
    pagamentosCooperado: [],
    descontos: [],
    mensalidades: [],
    arquivosMensais: [],
    comunicados: [],
    config: { descontoPadraoCooperativa: 5 },
    ...extra,
  } as OperacionalSyncPayload;
}

function coopDescontos(data: AppData): number {
  return data.descontos.filter((d) => d.cooperadoId === COOPERADO).length;
}

function coopMensalidades(data: AppData): number {
  return data.mensalidades.filter((m) => m.cooperadoId === COOPERADO).length;
}

function coopArquivos(data: AppData): number {
  return data.arquivosMensais.filter((a) => a.cooperativaId === COOP).length;
}

clearCloudResetAppliedVersionForTests(CNPJ);
setCloudResetAppliedVersionForTests(CNPJ, VER);

// T1 — reapply + cloud parcial: domínios ausentes preservados após pipeline
{
  const { data: after } = syncOperacionalPullPipelineForTests(richLocal(), cloudPartialMisaligned(), COOP, CNPJ);
  assert.equal(coopDescontos(after), 2);
  assert.equal(coopMensalidades(after), 1);
  assert.equal(coopArquivos(after), 1);
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "p_conf" && p.status === "confirmado"));
}

// T2 — [] sem snapshot completo
{
  const cloud = {
    ...cloudPartialMisaligned(),
    descontos: [],
    mensalidades: [],
    updatedAt: "2026-09-21T00:00:00.000Z",
  } as OperacionalSyncPayload;
  const { data: after } = syncOperacionalPullPipelineForTests(richLocal(), cloud, COOP, CNPJ);
  assert.equal(coopDescontos(after), 2);
  assert.equal(coopMensalidades(after), 1);
}

// T3 — snapshot completo + autoridade: replace legítimo zera descontos
{
  clearCloudResetAppliedVersionForTests(CNPJ);
  const before = richLocal();
  const cloud = cloudFullAuthorized({ descontos: [] });
  assert.ok(operacionalRestorePreemptiveClearPermitido(before, cloud, COOP, CNPJ));
  const { data: after } = syncOperacionalPullPipelineForTests(before, cloud, COOP, CNPJ);
  assert.equal(coopDescontos(after), 0);
  setCloudResetAppliedVersionForTests(CNPJ, VER);
}

// T4 — confirmado local × aguardando cloud (merge S3, sem replace de coleção)
{
  const cloud = {
    ...cloudPartialMisaligned(),
    pagamentosCooperado: [pag("p_conf", "aguardando_confirmacao", "2026-09-20T13:00:00.000Z")],
  } as OperacionalSyncPayload;
  const { data: after } = syncOperacionalPullPipelineForTests(richLocal(), cloud, COOP, CNPJ);
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "p_conf" && p.status === "confirmado"));
}

// T5 — A→B→A
{
  const a = syncOperacionalPullPipelineForTests(richLocal(), cloudPartialMisaligned(), COOP, CNPJ).data;
  const b = syncOperacionalPullPipelineForTests(
    a,
    { ...cloudPartialMisaligned(), updatedAt: "2026-09-22T00:00:00.000Z", descontos: [desconto("d_cloud")] },
    COOP,
    CNPJ
  ).data;
  assert.ok(coopDescontos(b) >= 2);
  const back = syncOperacionalPullPipelineForTests(
    b,
    cloudPartialMisaligned(),
    COOP,
    CNPJ
  ).data;
  assert.equal(coopMensalidades(back), 1);
  assert.ok(back.pagamentosCooperado.some((p) => p.status === "confirmado"));
}

// T6 — idempotência restore + pipeline
{
  const once = syncOperacionalPullPipelineForTests(richLocal(), cloudPartialMisaligned(), COOP, CNPJ).data;
  const twice = syncOperacionalPullPipelineForTests(once, cloudPartialMisaligned(), COOP, CNPJ).data;
  assert.deepEqual(
    once.descontos.filter((d) => d.cooperadoId === COOPERADO),
    twice.descontos.filter((d) => d.cooperadoId === COOPERADO)
  );
  assert.deepEqual(once.mensalidades, twice.mensalidades);
}

// T7 — reset vazio legítimo: clear preemptivo só quando o gate explicitamente permite
{
  clearCloudResetAppliedVersionForTests(CNPJ);
  const emptyLocal = {
    ...richLocal(),
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    descontos: [desconto("d_tmp")],
    mensalidades: [],
    arquivosMensais: [],
  } as AppData;
  const cloud = {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER + 1,
    fichaCorrida: [],
    pagamentosCooperado: [],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
  setRestoreLegacyBypassWindowForTests(true);
  try {
    const reset = applyCloudOperationalResetIfNeeded(emptyLocal, CNPJ, COOP, cloud, {
      permitirPreemptiveClear: true,
    });
    assert.equal(reset.changed, true);
    assert.equal(reset.data.descontos.length, 0);
    const noop = applyCloudOperationalResetIfNeeded(reset.data, CNPJ, COOP, cloud, {
      permitirPreemptiveClear: true,
    });
    assert.equal(noop.changed, false);
  } finally {
    setRestoreLegacyBypassWindowForTests(false);
  }
  setCloudResetAppliedVersionForTests(CNPJ, VER);
}

// reapply isolado: mismatch sem autoridade não clear
{
  setCloudResetAppliedVersionForTests(CNPJ, VER);
  setRestoreLegacyBypassWindowForTests(true);
  try {
    const stale = reapplyCloudOperationalSliceIfStale(
      richLocal(),
      CNPJ,
      COOP,
      cloudPartialMisaligned(),
      { permitirPreemptiveClear: false }
    );
    assert.equal(stale.changed, false);
    assert.equal(coopDescontos(stale.data), 2);
  } finally {
    setRestoreLegacyBypassWindowForTests(false);
  }
}

// reapply com autoridade + primeira aplicação: clear permitido
{
  clearCloudResetAppliedVersionForTests(CNPJ);
  const before = richLocal();
  const cloud = cloudFullAuthorized();
  setRestoreLegacyBypassWindowForTests(true);
  try {
    const permit = operacionalRestorePreemptiveClearPermitido(before, cloud, COOP, CNPJ);
    assert.ok(permit);
    const reset = applyCloudOperationalResetIfNeeded(before, CNPJ, COOP, cloud, {
      permitirPreemptiveClear: permit,
    });
    assert.equal(reset.changed, true);
    assert.equal(coopDescontos(reset.data), 0);
  } finally {
    setRestoreLegacyBypassWindowForTests(false);
  }
  setCloudResetAppliedVersionForTests(CNPJ, VER);
}

console.log("OK — test-sync-001-r1-restore-safe");
